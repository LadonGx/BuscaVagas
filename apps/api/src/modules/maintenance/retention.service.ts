import { MANUAL_SOURCE, type RetentionReportDto } from '@busca-vagas/shared';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Retenção: apaga vagas que não seguiram adiante depois de RETENTION_DAYS.
 *
 *   descartadas       triadas como `dismissed` há mais de N dias
 *   caixa esquecida   nunca triadas (`inbox`) que a fonte não traz há N dias
 *
 * Nunca toca em: salvas, vagas com candidatura, vagas manuais na caixa.
 * A URL de cada descartada apagada vai para `ForgottenJob`, para a fonte não
 * trazê-la de volta. Plano: docs/features/08-retention.md
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Quanto sairia agora, sem apagar nada. */
  async preview(now: Date = new Date()): Promise<RetentionReportDto> {
    const plan = this.plan(now);
    if (!plan) return this.disabled(true);

    const [dismissed, stale, sourceRuns, forgottenExpired] = await Promise.all([
      this.prisma.job.count({ where: plan.dismissed }),
      this.prisma.job.count({ where: plan.stale }),
      this.prisma.sourceRun.count({ where: plan.sourceRuns }),
      this.prisma.forgottenJob.count({ where: plan.forgottenExpired }),
    ]);

    return { ...plan.report, dismissed, stale, sourceRuns, forgottenExpired, dryRun: true };
  }

  /** Apaga de verdade, numa transação. */
  async run(now: Date = new Date()): Promise<RetentionReportDto> {
    const plan = this.plan(now);
    if (!plan) return this.disabled(false);

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Lembrar as URLs das descartadas antes de apagar.
      const toForget = await tx.job.findMany({
        where: { ...plan.dismissed, url: { not: null } },
        select: { url: true, source: true },
      });
      if (toForget.length > 0) {
        await tx.forgottenJob.createMany({
          data: toForget.map((job) => ({ url: job.url!, source: job.source, forgottenAt: now })),
          skipDuplicates: true,
        });
      }

      // 2. Apagar. As condições se repetem no delete: o que mudou no meio
      //    (ex.: você salvou a vaga) não é apagado.
      const dismissed = await tx.job.deleteMany({ where: plan.dismissed });
      const stale = await tx.job.deleteMany({ where: plan.stale });
      const sourceRuns = await tx.sourceRun.deleteMany({ where: plan.sourceRuns });
      const forgottenExpired = await tx.forgottenJob.deleteMany({
        where: plan.forgottenExpired,
      });

      return {
        dismissed: dismissed.count,
        stale: stale.count,
        sourceRuns: sourceRuns.count,
        forgottenExpired: forgottenExpired.count,
      };
    });

    const total = result.dismissed + result.stale;
    if (total > 0 || result.sourceRuns > 0 || result.forgottenExpired > 0) {
      this.logger.log(
        `Retenção: ${result.dismissed} descartada(s) e ${result.stale} esquecida(s) apagadas, ` +
          `${result.sourceRuns} execução(ões) antigas, ${result.forgottenExpired} URL(s) expiradas`,
      );
    }

    return { ...plan.report, ...result, dryRun: false };
  }

  /* ----------------------------------------------------------- internos */

  /** As condições de cada regra. `null` = retenção desligada. */
  private plan(now: Date) {
    const days = this.config.get('RETENTION_DAYS', { infer: true });
    if (days === 0) return null;

    const cutoff = new Date(now.getTime() - days * DAY_MS);
    const forgetDays = this.config.get('RETENTION_FORGET_DAYS', { infer: true });
    const forgetCutoff = new Date(now.getTime() - forgetDays * DAY_MS);

    const noApplication: Prisma.JobWhereInput = { application: { is: null } };

    return {
      report: { enabled: true, days, cutoff: cutoff.toISOString() },
      dismissed: {
        ...noApplication,
        triage: 'dismissed',
        triagedAt: { lt: cutoff },
      } satisfies Prisma.JobWhereInput,
      stale: {
        ...noApplication,
        triage: 'inbox',
        source: { not: MANUAL_SOURCE },
        lastSeenAt: { lt: cutoff },
      } satisfies Prisma.JobWhereInput,
      sourceRuns: { startedAt: { lt: cutoff } } satisfies Prisma.SourceRunWhereInput,
      forgottenExpired: {
        forgottenAt: { lt: forgetCutoff },
      } satisfies Prisma.ForgottenJobWhereInput,
    };
  }

  private disabled(dryRun: boolean): RetentionReportDto {
    return {
      enabled: false,
      days: 0,
      cutoff: null,
      dismissed: 0,
      stale: 0,
      sourceRuns: 0,
      forgottenExpired: 0,
      dryRun,
    };
  }
}
