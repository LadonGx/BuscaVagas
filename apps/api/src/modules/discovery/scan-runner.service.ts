import type { ScanTrigger, SourceRunDto } from '@busca-vagas/shared';
import { runSource, type HttpClient, type JobSource } from '@busca-vagas/sources';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AvailabilityService } from '../jobs/availability.service';
import { JobsService } from '../jobs/jobs.service';
import { TrackedCompaniesStore } from './companies/tracked-companies.store';
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
    private readonly companies: TrackedCompaniesStore,
    private readonly availability: AvailabilityService,
    @Inject(SOURCES) sources: JobSource[],
    @Inject(SOURCE_HTTP_CLIENT) private readonly http: HttpClient,
  ) {
    this.byId = new Map(sources.map((source) => [source.id, source]));
  }

  /**
   * `null` = nada a fazer: board sem empresas ligadas (a agenda continua de
   * pé e passa a buscar assim que alguém adicionar uma empresa).
   */
  async run(sourceId: string, terms: string[], trigger: ScanTrigger): Promise<SourceRunDto | null> {
    const source = this.byId.get(sourceId);
    if (!source) {
      throw new Error(`Fonte "${sourceId}" não está ativa.`);
    }

    // Só as fontes de busca usam termos (registrar nas outras só confundiria).
    // Boards de empresa usam as empresas acompanhadas, lidas do banco agora.
    const isBoard = source.kind === 'company-board';
    const usedTerms = source.kind === 'search' ? terms : [];
    const companies = isBoard ? await this.companies.activeFor(sourceId) : undefined;
    if (companies?.length === 0) {
      this.logger.log(`${sourceId}: nenhuma empresa acompanhada — nada a buscar.`);
      return null;
    }

    const run = await this.prisma.sourceRun.create({
      data: { sourceId, terms: usedTerms, trigger, status: 'running' },
    });

    const { jobs, outcome } = await runSource(
      source,
      companies ? { terms: usedTerms, companies } : { terms: usedTerms },
      this.http,
      (message) => this.logger.log(message),
    );

    if (outcome.companies) {
      await this.companies.recordScan(sourceId, outcome.companies).catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn(`${sourceId}: não consegui guardar o resultado das empresas: ${reason}`);
      });
    }

    if (outcome.status === 'failed') {
      const failed = await this.finish(run.id, {
        status: 'failed',
        jobsFound: 0,
        jobsNew: 0,
        dropped: outcome.dropped,
        filtered: outcome.filtered,
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
        filtered: outcome.filtered,
        durationMs: outcome.durationMs,
        error: `Falha ao gravar as vagas: ${message}`,
      });
      throw new SourceRunFailedError(failed, `${sourceId}: ${failed.error}`);
    }

    // Vagas que saíram do board da empresa ficam encerradas
    // (docs/features/13-availability.md). Só depois de gravar, para que uma
    // vaga reaberta não seja fechada de novo.
    if (outcome.companies) {
      await this.availability
        .recordBoardScan(sourceId, outcome.companies)
        .catch((error: unknown) => {
          const reason = error instanceof Error ? error.message : String(error);
          this.logger.warn(`${sourceId}: não consegui marcar as vagas encerradas: ${reason}`);
        });
    }

    const done = await this.finish(run.id, {
      status: 'ok',
      jobsFound: outcome.jobs,
      jobsNew: created,
      dropped: outcome.dropped,
      filtered: outcome.filtered,
      durationMs: outcome.durationMs,
      error: null,
    });

    this.logger.log(
      `${sourceId}: ${done.jobsFound} vagas (${done.jobsNew} novas, ${done.filtered} filtradas, ` +
        `${done.dropped} descartadas) em ${done.durationMs} ms`,
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
      filtered: number;
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
