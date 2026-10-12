import type {
  Page,
  ScanInput,
  ScanResultDto,
  SourceInfoDto,
  SourceRunDto,
  SourceRunsQuery,
} from '@busca-vagas/shared';
import type { JobSource } from '@busca-vagas/sources';
import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { Env } from '../../config/env';
import { afterCursor, decodeCursor, toPage } from '../../common/pagination/cursor';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUES } from '../../queue/queue.constants';
import { TrackedCompaniesStore } from './companies/tracked-companies.store';
import {
  NO_COMPANIES_REASON,
  SCAN_JOB_NAME,
  scanDedupId,
  schedulerId,
  SOURCES,
  UNAVAILABLE_SOURCES,
  type ScanJobData,
  type UnavailableSource,
} from './discovery.constants';
import { toSourceRunDto } from './discovery.mapper';

/** Fila fora do ar não pode travar a lista de fontes: desiste depois disso. */
const QUEUE_STATE_TIMEOUT_MS = 1_500;

interface QueueState {
  /** Próxima execução agendada por fonte (ms). */
  nextRun: Map<string, number>;
  /** Fontes com job esperando ou rodando. */
  running: Set<string>;
}

/**
 * Fachada da descoberta para a API: listar fontes, enfileirar varreduras e
 * ler o histórico. Quem executa é o `ScanRunner`, via fila.
 */
@Injectable()
export class DiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly companies: TrackedCompaniesStore,
    @Inject(SOURCES) private readonly sources: JobSource[],
    @Inject(UNAVAILABLE_SOURCES) private readonly unavailable: UnavailableSource[],
    @InjectQueue(QUEUES.SOURCE_SCAN) private readonly queue: Queue<ScanJobData>,
  ) {}

  /** Ativas primeiro; depois as que existem mas não rodam, com o motivo. */
  async listSources(): Promise<SourceInfoDto[]> {
    const ids = [...this.sources.map((source) => source.id), ...this.unavailable.map((s) => s.id)];
    const lastRuns = await this.prisma.sourceRun.findMany({
      where: { sourceId: { in: ids } },
      orderBy: { startedAt: 'desc' },
      distinct: ['sourceId'],
    });
    const lastBySource = new Map(lastRuns.map((run) => [run.sourceId, toSourceRunDto(run)]));
    const [state, counts] = await Promise.all([this.queueState(), this.companies.activeCounts()]);

    return [
      ...this.sources.map((source) => {
        const tracked = source.kind === 'company-board' ? (counts.get(source.id) ?? 0) : null;
        const idle = tracked === 0;
        const next = state.nextRun.get(source.id);
        return {
          id: source.id,
          displayName: source.displayName,
          kind: source.kind,
          active: !idle,
          reason: idle ? NO_COMPANIES_REASON : null,
          trackedCompanies: tracked,
          lastRun: lastBySource.get(source.id) ?? null,
          nextRunAt: next && !idle ? new Date(next).toISOString() : null,
          running: state.running.has(source.id),
        };
      }),
      ...this.unavailable.map((source) => ({
        id: source.id,
        displayName: source.displayName,
        kind: source.kind,
        active: false,
        reason: source.reason,
        trackedCompanies: null,
        lastRun: lastBySource.get(source.id) ?? null,
        nextRunAt: null,
        running: false,
      })),
    ];
  }

  /**
   * Agenda e jobs em andamento, lidos do Redis. Os agendados ficam como
   * `delayed` até a hora — por isso só `waiting`/`active`/`prioritized`
   * contam como "rodando". Sem Redis, devolve vazio em vez de falhar.
   */
  private async queueState(): Promise<QueueState> {
    const empty: QueueState = { nextRun: new Map(), running: new Set() };
    const bySchedulerId = new Map(
      this.sources.map((source) => [schedulerId(source.id), source.id]),
    );

    const read = async (): Promise<QueueState> => {
      const [schedulers, jobs] = await Promise.all([
        this.queue.getJobSchedulers(0, -1),
        this.queue.getJobs(['waiting', 'active', 'prioritized']),
      ]);
      const nextRun = new Map<string, number>();
      for (const scheduler of schedulers) {
        const sourceId = bySchedulerId.get(scheduler.key);
        if (sourceId && scheduler.next) nextRun.set(sourceId, scheduler.next);
      }
      const running = new Set(jobs.filter(Boolean).map((job) => job.data.sourceId));
      return { nextRun, running };
    };

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<QueueState>((resolve) => {
      timer = setTimeout(() => resolve(empty), QUEUE_STATE_TIMEOUT_MS);
    });

    try {
      return await Promise.race([read(), timeout]);
    } catch {
      return empty;
    } finally {
      clearTimeout(timer);
    }
  }

  async scan(input: ScanInput): Promise<ScanResultDto> {
    const counts = await this.companies.activeCounts();
    // Board sem empresas ligadas não tem o que buscar: entra como desligado.
    const idle = this.sources.filter(
      (source) => source.kind === 'company-board' && !counts.get(source.id),
    );
    const active = new Set(
      this.sources.filter((source) => !idle.includes(source)).map((source) => source.id),
    );
    const unavailable = new Map([
      ...idle.map((source) => [source.id, NO_COMPANIES_REASON] as const),
      ...this.unavailable.map((source) => [source.id, source.reason] as const),
    ]);
    // Sem lista: todas as ativas, e as desligadas só para avisar o motivo.
    const requested = input.sources ?? [...active, ...unavailable.keys()];
    const terms = input.terms ?? this.config.get('DISCOVERY_TERMS', { infer: true });

    const result: ScanResultDto = {
      queued: [],
      alreadyQueued: [],
      inactive: [...new Set(requested)]
        .filter((id) => unavailable.has(id))
        .map((sourceId) => ({ sourceId, reason: unavailable.get(sourceId) ?? '' })),
      unknown: requested.filter((id) => !active.has(id) && !unavailable.has(id)),
      terms,
    };

    for (const sourceId of [...new Set(requested)].filter((id) => active.has(id))) {
      const dedupId = scanDedupId(sourceId);

      if (await this.queue.getDeduplicationJobId(dedupId)) {
        result.alreadyQueued.push(sourceId);
        continue;
      }

      const job = await this.queue.add(
        SCAN_JOB_NAME,
        { sourceId, terms, trigger: 'manual' },
        { deduplication: { id: dedupId } },
      );
      result.queued.push({ sourceId, jobId: String(job.id) });
    }

    return result;
  }

  /** Histórico, mais recente primeiro, paginado por cursor. */
  async runs(query: SourceRunsQuery): Promise<Page<SourceRunDto>> {
    const and: Prisma.SourceRunWhereInput[] = [];
    if (query.sourceId) and.push({ sourceId: query.sourceId });
    if (query.cursor) {
      and.push(afterCursor('startedAt', decodeCursor(query.cursor)) as Prisma.SourceRunWhereInput);
    }

    const rows = await this.prisma.sourceRun.findMany({
      where: { AND: and },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    return toPage(rows, query.limit, (run) => run.startedAt, toSourceRunDto);
  }
}
