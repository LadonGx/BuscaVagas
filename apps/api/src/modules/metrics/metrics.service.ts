import {
  median,
  RESPONSE_BUCKETS,
  RESPONSE_STATUSES,
  responseBucket,
  WAITING_STALE_DAYS,
  weeksBetween,
  weekStart,
  type MetricsDto,
  type MetricsPeriod,
  type SourceMetricsDto,
  type StackMetricDto,
} from '@busca-vagas/shared';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { localDateKey, localTimeZone } from '../dashboard/local-day';
import { ResumeService } from '../resume/resume.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_STACKS = 15;
const MISSING_STACKS = 10;
/** "Tudo" no gráfico por semana: no máximo um ano. */
const MAX_WEEKS = 52;

/**
 * Métricas para a tela de Métricas. Plano: docs/features/17-metrics.md
 *
 * Vagas contam pela entrada no app (`firstSeenAt`); candidaturas, pela data
 * em que você se candidatou (`appliedAt`). Vagas que a limpeza apagou não
 * entram (descartadas há mais de RETENTION_DAYS).
 */
@Injectable()
export class MetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resume: ResumeService,
  ) {}

  async get(
    days: MetricsPeriod,
    now: Date = new Date(),
    timeZone: string = localTimeZone(),
  ): Promise<MetricsDto> {
    const since = days > 0 ? new Date(now.getTime() - days * DAY_MS) : null;
    const [sources, stacks, applications] = await Promise.all([
      this.sources(since),
      this.stacks(since),
      this.applications(since),
    ]);

    return {
      days: days > 0 ? days : null,
      since: since?.toISOString() ?? null,
      sources: mergeSources(sources, applications),
      stacks,
      responses: responseStats(applications, now),
      weekly: weekly(applications, since, now, timeZone),
    };
  }

  private async sources(since: Date | null) {
    const from = since ?? new Date(0);
    return this.prisma.$queryRaw<
      { source: string; found: number; compatible: number; saved: number }[]
    >`
      SELECT source,
             count(*)::int AS found,
             count(*) FILTER (WHERE NOT incompatible)::int AS compatible,
             count(*) FILTER (WHERE triage = 'saved')::int AS saved
      FROM "Job"
      WHERE "firstSeenAt" >= ${from}
      GROUP BY source
    `;
  }

  private async stacks(since: Date | null): Promise<MetricsDto['stacks']> {
    const from = since ?? new Date(0);
    const [rows, [total], resume] = await Promise.all([
      this.prisma.$queryRaw<{ name: string; jobs: number }[]>`
        SELECT s AS name, count(DISTINCT j.id)::int AS jobs
        FROM "Job" j, unnest(j.stack) AS s
        WHERE j."firstSeenAt" >= ${from}
        GROUP BY s
        ORDER BY jobs DESC, s ASC
      `,
      this.prisma.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM "Job" WHERE "firstSeenAt" >= ${from}
      `,
      this.resume.stacks(),
    ]);
    const jobs = total?.count ?? 0;
    const mine = new Set(resume.stacks.map((stack) => stack.name));
    const all: StackMetricDto[] = rows.map((row) => ({
      name: row.name,
      jobs: row.jobs,
      share: jobs > 0 ? row.jobs / jobs : 0,
      inResume: mine.has(row.name),
    }));
    return {
      jobs,
      top: all.slice(0, TOP_STACKS),
      missing: mine.size > 0 ? all.filter((stack) => !stack.inResume).slice(0, MISSING_STACKS) : [],
      resumeHasStacks: mine.size > 0,
    };
  }

  /** Candidaturas do período, com a fonte e o dia da primeira resposta. */
  private async applications(since: Date | null) {
    const rows = await this.prisma.application.findMany({
      where: since ? { appliedAt: { gte: since } } : {},
      select: {
        appliedAt: true,
        status: true,
        job: { select: { source: true } },
        events: {
          where: { status: { in: [...RESPONSE_STATUSES] } },
          orderBy: { occurredAt: 'asc' },
          take: 1,
          select: { occurredAt: true },
        },
      },
    });
    return rows.map((row) => ({
      appliedAt: row.appliedAt,
      status: row.status,
      source: row.job.source,
      respondedAt: row.events[0]?.occurredAt ?? null,
    }));
  }
}

type ApplicationRow = Awaited<ReturnType<MetricsService['applications']>>[number];

function mergeSources(
  jobs: { source: string; found: number; compatible: number; saved: number }[],
  applications: ApplicationRow[],
): SourceMetricsDto[] {
  const bySource = new Map<string, SourceMetricsDto>();
  const get = (sourceId: string) => {
    let entry = bySource.get(sourceId);
    if (!entry) {
      entry = { sourceId, found: 0, compatible: 0, saved: 0, applied: 0, responded: 0 };
      bySource.set(sourceId, entry);
    }
    return entry;
  };
  for (const row of jobs) {
    Object.assign(get(row.source), {
      found: row.found,
      compatible: row.compatible,
      saved: row.saved,
    });
  }
  for (const application of applications) {
    const entry = get(application.source);
    entry.applied += 1;
    if (application.respondedAt) entry.responded += 1;
  }
  return [...bySource.values()].sort(
    (a, b) => b.applied - a.applied || b.found - a.found || a.sourceId.localeCompare(b.sourceId),
  );
}

function responseStats(applications: ApplicationRow[], now: Date): MetricsDto['responses'] {
  const buckets = RESPONSE_BUCKETS.map((bucket) => ({ label: bucket.label, count: 0 }));
  const days: number[] = [];
  let waiting = 0;
  let waitingStale = 0;
  for (const application of applications) {
    if (application.respondedAt) {
      const value = Math.max(
        0,
        (application.respondedAt.getTime() - application.appliedAt.getTime()) / DAY_MS,
      );
      days.push(value);
      buckets[responseBucket(Math.ceil(value))]!.count += 1;
    } else if (application.status === 'applied') {
      waiting += 1;
      if (now.getTime() - application.appliedAt.getTime() > WAITING_STALE_DAYS * DAY_MS) {
        waitingStale += 1;
      }
    }
  }
  return {
    applications: applications.length,
    responded: days.length,
    medianDays: median(days),
    buckets,
    waiting,
    waitingStale,
  };
}

function weekly(
  applications: ApplicationRow[],
  since: Date | null,
  now: Date,
  timeZone: string,
): MetricsDto['weekly'] {
  const today = localDateKey(now, timeZone);
  const keyed = applications.map((application) => ({
    week: weekStart(localDateKey(application.appliedAt, timeZone)),
    responded: application.respondedAt !== null,
  }));
  const first = since
    ? localDateKey(since, timeZone)
    : (keyed.map((item) => item.week).sort()[0] ?? today);
  const weeks = weeksBetween(first, today).slice(-MAX_WEEKS);
  const counts = new Map(weeks.map((week) => [week, { week, sent: 0, responded: 0 }]));
  for (const item of keyed) {
    const entry = counts.get(item.week);
    if (!entry) continue;
    entry.sent += 1;
    if (item.responded) entry.responded += 1;
  }
  return [...counts.values()];
}
