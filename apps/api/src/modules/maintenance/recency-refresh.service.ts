import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { localTimeZone, startOfLocalDay } from '../dashboard/local-day';
import { loadPreferences } from '../preferences/preferences.store';
import { SCORE_REQUESTER, type ScoreRequester } from '../scoring/scoring.constants';

export interface RecencyRefreshResult {
  /** Vagas que voltaram para a fila da nota. */
  invalidated: number;
}

/**
 * A nota de "publicada há N dias" é calculada com a data do cálculo: sem
 * recalcular, uma vaga de ontem continuaria "Publicada hoje" para sempre.
 * Uma vez por dia (fila `maintenance`), se as preferências usam a idade da
 * vaga (`maxAgeDays`), as vagas não descartadas pontuadas antes de hoje
 * voltam para a fila. Plano: docs/features/07-preferences-score.md
 */
@Injectable()
export class RecencyRefreshService {
  private readonly logger = new Logger('Nota');

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(SCORE_REQUESTER) private readonly scoring?: ScoreRequester,
  ) {}

  async run(now = new Date(), timeZone = localTimeZone()): Promise<RecencyRefreshResult> {
    const { values } = await loadPreferences(this.prisma);
    if (values.maxAgeDays === null) return { invalidated: 0 };

    // SQL direto para não mexer no `updatedAt` (não é uma edição da vaga).
    // As colunas são `timestamp(3)` sem fuso, gravadas em UTC.
    const today = startOfLocalDay(now, timeZone).toISOString().replace('Z', '');
    const invalidated = await this.prisma.$executeRaw`
      UPDATE "Job" SET "scoredVersion" = NULL
      WHERE "triage" <> 'dismissed'
        AND "scoredVersion" IS NOT NULL
        AND ("scoredAt" IS NULL OR "scoredAt" < ${today}::timestamp(3))`;

    if (invalidated > 0) {
      this.logger.log(`Idade das vagas: ${invalidated} nota(s) de volta para a fila`);
      await this.scoring?.request('recency');
    }
    return { invalidated };
  }
}
