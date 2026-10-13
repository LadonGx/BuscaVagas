import type { JobDto } from '@busca-vagas/shared';
import {
  checkAvailability,
  createHttpClient,
  type CompanyScanStat,
  type HttpClient,
} from '@busca-vagas/sources';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JobsService } from './jobs.service';

/** Cliente HTTP da conferência (trocado por um falso nos testes). */
export const AVAILABILITY_HTTP = Symbol('AVAILABILITY_HTTP');

export const availabilityHttpProvider = {
  provide: AVAILABILITY_HTTP,
  useFactory: (): HttpClient => createHttpClient({ timeoutMs: 10_000, maxBytes: 4 * 1024 * 1024 }),
};

const HOUR_MS = 60 * 60 * 1000;

export interface DailyCheckResult {
  checked: number;
  /** Encerradas nesta rodada (antes estavam abertas ou sem informação). */
  closed: number;
}

/**
 * "A vaga ainda está aberta?" — docs/features/13-availability.md
 *
 *  - passivo: um board lido com sucesso diz quais vagas da empresa existem;
 *    a vaga da empresa que não está lá saiu (e volta a abrir se aparecer);
 *  - ativo: uma requisição por vaga (botão no painel e a rodada diária das
 *    salvas), pelo jeito certo de cada lugar (`checkAvailability`).
 */
@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger('Disponibilidade');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    @Inject(AVAILABILITY_HTTP) private readonly http: HttpClient,
  ) {}

  /** Depois de uma busca num board: fecha as que saíram, reabre as que voltaram. */
  async recordBoardScan(
    sourceId: string,
    stats: readonly CompanyScanStat[],
    now = new Date(),
  ): Promise<{ closed: number; reopened: number }> {
    let closed = 0;
    let reopened = 0;
    for (const stat of stats) {
      if (stat.status !== 'ok' || !stat.externalIds) continue;
      const company = { source: sourceId, board: stat.slug };
      closed += (
        await this.prisma.job.updateMany({
          where: { ...company, closedAt: null, externalId: { notIn: stat.externalIds } },
          data: { closedAt: now, closedReason: 'Saiu do board da empresa' },
        })
      ).count;
      if (stat.externalIds.length > 0) {
        reopened += (
          await this.prisma.job.updateMany({
            where: { ...company, closedAt: { not: null }, externalId: { in: stat.externalIds } },
            data: { closedAt: null, closedReason: null },
          })
        ).count;
      }
    }
    if (closed || reopened) {
      this.logger.log(`${sourceId}: ${closed} vaga(s) saíram do board, ${reopened} voltaram`);
    }
    return { closed, reopened };
  }

  /** Confere uma vaga agora e guarda o resultado. */
  async check(id: string, now = new Date()): Promise<JobDto> {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) throw new NotFoundException({ statusCode: 404, message: 'Vaga não encontrada.' });

    const result = await checkAvailability(job, this.http, now);
    await this.prisma.job.update({
      where: { id },
      data: {
        checkedAt: now,
        checkState: result.state,
        checkReason: result.reason,
        // Fechou agora: guarda quando e por quê. Aberta: a conferência é mais
        // nova que qualquer sinal antigo. Sem saber: não mexe.
        ...(result.state === 'closed' && {
          closedAt: job.closedAt ?? now,
          closedReason: result.reason,
        }),
        ...(result.state === 'open' && { closedAt: null, closedReason: null }),
      },
    });
    return this.jobs.get(id);
  }

  /**
   * Rodada diária: as salvas (sem candidatura) ainda abertas, que não foram
   * conferidas nas últimas 20 h. Uma por vez, com pausa — é educado com os sites.
   */
  async checkSaved(
    options: { limit?: number; pauseMs?: number; now?: Date } = {},
  ): Promise<DailyCheckResult> {
    const { limit = 100, pauseMs = 1_000, now = new Date() } = options;
    const due = await this.prisma.job.findMany({
      where: {
        triage: 'saved',
        application: { is: null },
        closedAt: null,
        OR: [{ checkedAt: null }, { checkedAt: { lt: new Date(now.getTime() - 20 * HOUR_MS) } }],
      },
      orderBy: [{ checkedAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
      take: limit,
      select: { id: true },
    });

    let closed = 0;
    for (const [index, { id }] of due.entries()) {
      if (index > 0 && pauseMs > 0) await new Promise((resolve) => setTimeout(resolve, pauseMs));
      const job = await this.check(id, now).catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Não consegui conferir ${id}: ${reason}`);
        return null;
      });
      if (job?.availability.state === 'closed') closed += 1;
    }
    if (due.length > 0) {
      this.logger.log(`Salvas conferidas: ${due.length}, encerradas: ${closed}`);
    }
    return { checked: due.length, closed };
  }
}
