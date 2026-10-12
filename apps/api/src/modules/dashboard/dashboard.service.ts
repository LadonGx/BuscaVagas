import {
  DASHBOARD_DAYS,
  DASHBOARD_LIST_SIZE,
  SCORE_TIER_MIN,
  TOP_NEW_DAYS,
  UPCOMING_DAYS,
  type DashboardDto,
} from '@busca-vagas/shared';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { applicationInclude, toApplicationDto } from '../applications/applications.mapper';
import { jobInclude, toJobDto } from '../jobs/jobs.mapper';
import { loadScoreVersion } from '../preferences/preferences.store';
import { lastLocalDays, localTimeZone, startOfLocalDay } from './local-day';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Dados da tela Início numa requisição só.
 * Plano: docs/features/09-screen-data.md
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(now: Date = new Date(), timeZone: string = localTimeZone()): Promise<DashboardDto> {
    // Nota de preferências antigas ainda vai ser recalculada: fica de fora
    // das contas de "nota alta" até a fila passar.
    const version = await loadScoreVersion(this.prisma);
    const [
      newJobsPerDay,
      newLast24h,
      highScoreInbox,
      topNew,
      upcomingSteps,
      stepsNextDays,
      funnel,
      median,
    ] = await Promise.all([
      this.newJobsPerDay(now, timeZone),
      this.prisma.job.count({
        where: { firstSeenAt: { gte: new Date(now.getTime() - DAY_MS) } },
      }),
      this.prisma.job.count({
        where: {
          triage: 'inbox',
          incompatible: false,
          scoredVersion: { gte: version },
          score: { gte: SCORE_TIER_MIN.great },
        },
      }),
      this.topNew(now, version),
      this.upcomingSteps(now, timeZone),
      this.prisma.application.count({ where: stepsWindow(now, timeZone, UPCOMING_DAYS) }),
      this.funnel(),
      this.medianDaysToFirstResponse(),
    ]);

    return {
      newJobsPerDay,
      newLast24h,
      highScoreInbox,
      topNew,
      upcomingSteps,
      stepsNextDays,
      funnel,
      medianDaysToFirstResponse: median,
    };
  }

  /**
   * `firstSeenAt` é gravado em UTC sem fuso (`timestamp`): primeiro marca
   * como UTC, depois converte para o fuso local e só então pega o dia.
   */
  private async newJobsPerDay(now: Date, timeZone: string): Promise<DashboardDto['newJobsPerDay']> {
    const days = lastLocalDays(now, timeZone, DASHBOARD_DAYS);
    // Um dia a mais de folga: o filtro exato é feito pelas chaves abaixo.
    const since = new Date(now.getTime() - (DASHBOARD_DAYS + 1) * DAY_MS);

    const rows = await this.prisma.$queryRaw<{ day: string; count: number }[]>`
      SELECT to_char(("firstSeenAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS day,
             count(*)::int AS count
      FROM "Job"
      WHERE "firstSeenAt" >= ${since}
      GROUP BY 1
    `;
    const byDay = new Map(rows.map((row) => [row.day, row.count]));
    return days.map((date) => ({ date, count: byDay.get(date) ?? 0 }));
  }

  private async topNew(now: Date, version: number): Promise<DashboardDto['topNew']> {
    const rows = await this.prisma.job.findMany({
      where: {
        triage: 'inbox',
        incompatible: false,
        scoredVersion: { gte: version },
        score: { not: null },
        firstSeenAt: { gte: new Date(now.getTime() - TOP_NEW_DAYS * DAY_MS) },
      },
      orderBy: [{ score: 'desc' }, { firstSeenAt: 'desc' }, { id: 'desc' }],
      take: DASHBOARD_LIST_SIZE,
      include: jobInclude,
    });
    return rows.map((row) => toJobDto(row, version));
  }

  /** Abertas (sem recusa nem desistência), com etapa de hoje em diante. */
  private async upcomingSteps(now: Date, timeZone: string): Promise<DashboardDto['upcomingSteps']> {
    const rows = await this.prisma.application.findMany({
      where: stepsWindow(now, timeZone),
      orderBy: [{ nextStepAt: 'asc' }, { id: 'asc' }],
      take: DASHBOARD_LIST_SIZE,
      include: applicationInclude,
    });
    return rows.map(toApplicationDto);
  }

  /**
   * Pelo histórico: uma candidatura que chegou à proposta passou pelo
   * processo, mesmo sem um evento "em processo" registrado. Recusa e
   * desistência não são etapa do funil.
   */
  private async funnel(): Promise<DashboardDto['funnel']> {
    const [row] = await this.prisma.$queryRaw<
      { applied: number; inProcess: number; offer: number }[]
    >`
      SELECT
        count(*)::int AS applied,
        count(*) FILTER (WHERE reached_process)::int AS "inProcess",
        count(*) FILTER (WHERE reached_offer)::int AS offer
      FROM (
        SELECT a.id,
          bool_or(e.status IN ('in_process', 'offer')) AS reached_process,
          bool_or(e.status = 'offer') AS reached_offer
        FROM "Application" a
        LEFT JOIN "StatusEvent" e ON e."applicationId" = a.id
        GROUP BY a.id
      ) AS per_application
    `;
    return {
      applied: row?.applied ?? 0,
      inProcess: row?.inProcess ?? 0,
      offer: row?.offer ?? 0,
    };
  }

  /** Dias entre a candidatura e o primeiro evento que não é "Aplicada". Uma casa decimal. */
  private async medianDaysToFirstResponse(): Promise<number | null> {
    const [row] = await this.prisma.$queryRaw<{ median: number | null }[]>`
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY days) AS median
      FROM (
        SELECT EXTRACT(EPOCH FROM (min(e."occurredAt") - a."appliedAt")) / 86400.0 AS days
        FROM "Application" a
        JOIN "StatusEvent" e ON e."applicationId" = a.id AND e.status <> 'applied'
        GROUP BY a.id, a."appliedAt"
      ) AS responses
    `;
    const median = row?.median;
    return median === null || median === undefined ? null : Math.round(Number(median) * 10) / 10;
  }
}

/**
 * Candidaturas abertas (sem recusa nem desistência) com etapa de hoje
 * (meia-noite local) em diante; com `days`, só até o fim do último dia.
 */
function stepsWindow(now: Date, timeZone: string, days?: number) {
  const from = startOfLocalDay(now, timeZone);
  return {
    status: { in: ['applied' as const, 'in_process' as const, 'offer' as const] },
    nextStepAt: {
      gte: from,
      // Meia-noite do dia seguinte ao último: conta no calendário, não em blocos de 24 h.
      ...(days
        ? { lt: startOfLocalDay(new Date(from.getTime() + (days + 0.5) * DAY_MS), timeZone) }
        : {}),
    },
  };
}
