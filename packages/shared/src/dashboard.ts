import type { ApplicationDto } from './applications';
import type { JobDto } from './jobs';

/**
 * Painel da tela Início.
 * Plano: docs/features/09-screen-data.md
 */

/** Dias da série "vagas novas por dia". */
export const DASHBOARD_DAYS = 14;
/** Janela de "melhores vagas novas". */
export const TOP_NEW_DAYS = 7;
/** Itens em "melhores vagas novas" e em "próximas etapas". */
export const DASHBOARD_LIST_SIZE = 5;

export interface DashboardDto {
  /** Vagas que entraram por dia (firstSeenAt), no fuso da máquina; dias sem vaga com 0. */
  newJobsPerDay: { date: string; count: number }[];
  /** Vagas que entraram nas últimas 24 h. */
  newLast24h: number;
  /** Caixa de entrada com nota ≥ 800. */
  highScoreInbox: number;
  /** Caixa, entraram nos últimos 7 dias, compatíveis, da maior nota. */
  topNew: JobDto[];
  /** Candidaturas abertas com próxima etapa de hoje em diante, da mais próxima. */
  upcomingSteps: ApplicationDto[];
  /** Quantas candidaturas chegaram a cada etapa, pelo histórico. */
  funnel: { applied: number; inProcess: number; offer: number };
  /** Mediana de dias entre a candidatura e o primeiro evento seguinte. `null` sem dados. */
  medianDaysToFirstResponse: number | null;
}
