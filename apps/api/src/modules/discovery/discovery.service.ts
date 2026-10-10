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
import { SCAN_JOB_NAME, scanDedupId, SOURCES, type ScanJobData } from './discovery.constants';
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
    @InjectQueue(QUEUES.SOURCE_SCAN) private readonly queue: Queue<ScanJobData>,
  ) {}

  async listSources(): Promise<SourceInfoDto[]> {
    const lastRuns = await this.prisma.sourceRun.findMany({
      where: { sourceId: { in: this.sources.map((source) => source.id) } },
      orderBy: { startedAt: 'desc' },
      distinct: ['sourceId'],
    });
    const lastBySource = new Map(lastRuns.map((run) => [run.sourceId, toSourceRunDto(run)]));

    return this.sources.map((source) => ({
      id: source.id,
      displayName: source.displayName,
      kind: source.kind,
      lastRun: lastBySource.get(source.id) ?? null,
    }));
  }

  async scan(input: ScanInput): Promise<ScanResultDto> {
    const active = new Set(this.sources.map((source) => source.id));
    const requested = input.sources ?? [...active];
    const terms = input.terms ?? this.config.get('DISCOVERY_TERMS', { infer: true });

    const result: ScanResultDto = {
      queued: [],
      alreadyQueued: [],
      unknown: requested.filter((id) => !active.has(id)),
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
