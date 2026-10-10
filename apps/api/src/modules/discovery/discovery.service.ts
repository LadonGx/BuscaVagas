import type {
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
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUES } from '../../queue/queue.constants';
import {
  SCAN_JOB_NAME,
  scanDedupId,
  SOURCES,
  UNAVAILABLE_SOURCES,
  type ScanJobData,
  type UnavailableSource,
} from './discovery.constants';
import { toSourceRunDto } from './discovery.mapper';

/**
 * Fachada da descoberta para a API: listar fontes, enfileirar varreduras e
 * ler o histórico. Quem executa é o `ScanRunner`, via fila.
 */
@Injectable()
export class DiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
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

    return [
      ...this.sources.map((source) => ({
        id: source.id,
        displayName: source.displayName,
        kind: source.kind,
        active: true,
        reason: null,
        lastRun: lastBySource.get(source.id) ?? null,
      })),
      ...this.unavailable.map((source) => ({
        id: source.id,
        displayName: source.displayName,
        kind: source.kind,
        active: false,
        reason: source.reason,
        lastRun: lastBySource.get(source.id) ?? null,
      })),
    ];
  }

  async scan(input: ScanInput): Promise<ScanResultDto> {
    const active = new Set(this.sources.map((source) => source.id));
    const unavailable = new Map(this.unavailable.map((source) => [source.id, source.reason]));
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

  async runs(query: SourceRunsQuery): Promise<SourceRunDto[]> {
    const runs = await this.prisma.sourceRun.findMany({
      where: query.sourceId ? { sourceId: query.sourceId } : {},
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
    });
    return runs.map(toSourceRunDto);
  }
}
