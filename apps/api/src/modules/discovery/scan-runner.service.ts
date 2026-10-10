import type { ScanTrigger, SourceRunDto } from '@busca-vagas/shared';
import { runSource, type HttpClient, type JobSource } from '@busca-vagas/sources';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JobsService } from '../jobs/jobs.service';
import { SOURCE_HTTP_CLIENT, SOURCES } from './discovery.constants';
import { toSourceRunDto } from './discovery.mapper';

export class SourceRunFailedError extends Error {
  constructor(
    readonly run: SourceRunDto,
    message: string,
  ) {
    super(message);
    this.name = 'SourceRunFailedError';
  }
}

/**
 * Executa UMA fonte do começo ao fim: registra a execução, busca, grava as
 * vagas e fecha o registro com as contagens. Não sabe de fila — o processor
 * chama isto, e os testes também (sem Redis).
 *
 * Falha (da fonte ou da gravação) fica registrada em `SourceRun` e depois é
 * relançada como `SourceRunFailedError`, para o BullMQ tentar de novo.
 */
@Injectable()
export class ScanRunner {
  private readonly logger = new Logger(ScanRunner.name);
  private readonly byId: Map<string, JobSource>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    @Inject(SOURCES) sources: JobSource[],
    @Inject(SOURCE_HTTP_CLIENT) private readonly http: HttpClient,
  ) {
    this.byId = new Map(sources.map((source) => [source.id, source]));
  }

  async run(sourceId: string, terms: string[], trigger: ScanTrigger): Promise<SourceRunDto> {
    const source = this.byId.get(sourceId);
    if (!source) {
      throw new Error(`Fonte "${sourceId}" não está ativa.`);
    }

    const run = await this.prisma.sourceRun.create({
      data: { sourceId, terms, trigger, status: 'running' },
    });

    const { jobs, outcome } = await runSource(source, { terms }, this.http, (message) =>
      this.logger.log(message),
    );

    if (outcome.status === 'failed') {
      const failed = await this.finish(run.id, {
        status: 'failed',
        jobsFound: 0,
        jobsNew: 0,
        dropped: outcome.dropped,
        durationMs: outcome.durationMs,
        error: outcome.error ?? 'erro desconhecido',
      });
      this.logger.warn(`${sourceId}: falhou — ${failed.error}`);
      throw new SourceRunFailedError(failed, `${sourceId}: ${failed.error}`);
    }

    let created: number;
    try {
      created = (await this.jobs.ingest(jobs)).created;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed = await this.finish(run.id, {
        status: 'failed',
        jobsFound: outcome.jobs,
        jobsNew: 0,
        dropped: outcome.dropped,
        durationMs: outcome.durationMs,
        error: `Falha ao gravar as vagas: ${message}`,
      });
      throw new SourceRunFailedError(failed, `${sourceId}: ${failed.error}`);
    }

    const done = await this.finish(run.id, {
      status: 'ok',
      jobsFound: outcome.jobs,
      jobsNew: created,
      dropped: outcome.dropped,
      durationMs: outcome.durationMs,
      error: null,
    });

    this.logger.log(
      `${sourceId}: ${done.jobsFound} vagas (${done.jobsNew} novas, ${done.dropped} descartadas) em ${done.durationMs} ms`,
    );
    return done;
  }

  private async finish(
    id: string,
    data: {
      status: 'ok' | 'failed';
      jobsFound: number;
      jobsNew: number;
      dropped: number;
      durationMs: number;
      error: string | null;
    },
  ): Promise<SourceRunDto> {
    const run = await this.prisma.sourceRun.update({
      where: { id },
      data: { ...data, finishedAt: new Date() },
    });
    return toSourceRunDto(run);
  }
}
