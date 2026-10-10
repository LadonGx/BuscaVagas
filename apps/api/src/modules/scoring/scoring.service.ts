import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { loadPreferences } from '../preferences/preferences.store';
import { scoreJob } from './score';
import { SCORING_BATCH_SIZE } from './scoring.constants';

export interface ScoreStaleResult {
  scored: number;
  batches: number;
}

/**
 * Grava a nota das vagas pendentes: as que nunca foram pontuadas
 * (`scoredVersion` nulo — novas ou editadas) e as pontuadas com uma versão
 * antiga das preferências. Roda na fila `scoring`, em lotes.
 *
 * Cuidados:
 *  - relê as preferências a cada lote: se mudarem no meio, o resto já sai
 *    com a versão nova e o que ficou para trás é pego no lote seguinte;
 *  - grava com SQL direto para NÃO mexer no `updatedAt` (calcular a nota não
 *    é editar a vaga) e só se a vaga não mudou desde a leitura — se você
 *    editou no meio, ela continua pendente e entra no próximo lote.
 */
@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(private readonly prisma: PrismaService) {}

  async scoreStale(batchSize = SCORING_BATCH_SIZE): Promise<ScoreStaleResult> {
    let scored = 0;
    let batches = 0;

    for (;;) {
      const prefs = await loadPreferences(this.prisma);
      const rows = await this.prisma.job.findMany({
        where: { OR: [{ scoredVersion: null }, { scoredVersion: { lt: prefs.version } }] },
        select: {
          id: true,
          updatedAt: true,
          title: true,
          company: true,
          location: true,
          workModel: true,
          contractType: true,
          seniority: true,
          stack: true,
          salaryMin: true,
          salaryMax: true,
          salaryCurrency: true,
          salaryPeriod: true,
          postedAt: true,
          firstSeenAt: true,
        },
        orderBy: { id: 'asc' },
        take: batchSize,
      });

      if (rows.length === 0) break;

      const now = new Date();
      const values = rows.map((row) => {
        const result = scoreJob(row, prefs.values, now);
        return Prisma.sql`(${row.id}, ${result.score}::int, ${result.coverage}::int, ${JSON.stringify(
          result.reasons,
        )}::jsonb, ${result.incompatible}::boolean, ${toTimestamp(row.updatedAt)}::timestamp(3))`;
      });

      const written = await this.prisma.$executeRaw`
        UPDATE "Job" AS j SET
          "score" = v.score,
          "scoreCoverage" = v.coverage,
          "scoreReasons" = v.reasons,
          "incompatible" = v.incompatible,
          "scoredVersion" = ${prefs.version}::int,
          "scoredAt" = ${toTimestamp(now)}::timestamp(3)
        FROM (VALUES ${Prisma.join(values)}) AS v(id, score, coverage, reasons, incompatible, "updatedAt")
        WHERE j.id = v.id AND j."updatedAt" = v."updatedAt"`;

      scored += written;
      batches += 1;

      // Nada gravado = todas mudaram no meio. Para não girar em falso, o
      // próximo pedido (que a edição já fez) retoma.
      if (written === 0) break;
    }

    if (scored > 0) {
      this.logger.log(`Notas calculadas: ${scored} vaga(s) em ${batches} lote(s)`);
    }
    return { scored, batches };
  }
}

/** As colunas são `timestamp(3)` sem fuso, gravadas em UTC pelo Prisma. */
function toTimestamp(date: Date): string {
  return date.toISOString().replace('Z', '');
}
