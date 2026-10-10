/**
 * Manutenção: retenção de vagas antigas.
 * Plano: docs/features/08-retention.md
 */

export interface RetentionReportDto {
  /** `false` quando RETENTION_DAYS=0: nada é apagado. */
  enabled: boolean;
  days: number;
  /** Data de corte (ISO): o que é anterior a ela sai. `null` se desligada. */
  cutoff: string | null;
  /** Descartadas há mais de `days` dias. */
  dismissed: number;
  /** Nunca triadas que a fonte não traz há mais de `days` dias. */
  stale: number;
  /** Execuções de varredura (`SourceRun`) mais antigas que o corte. */
  sourceRuns: number;
  /** URLs esquecidas que expiraram (a vaga pode voltar). */
  forgottenExpired: number;
  /** `true` na prévia (`GET`): nada foi apagado. */
  dryRun: boolean;
}
