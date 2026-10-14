import { z } from 'zod';
import type { ApplicationStatus } from './applications';

/**
 * Tela de Métricas: rendimento por fonte, stacks mais pedidas (e as que
 * faltam no currículo), tempo até a resposta e candidaturas por semana.
 * Plano: docs/features/17-metrics.md
 */

/** Períodos do seletor; 0 = tudo. */
export const METRICS_PERIODS = [30, 90, 0] as const;
export type MetricsPeriod = (typeof METRICS_PERIODS)[number];
export const DEFAULT_METRICS_PERIOD: MetricsPeriod = 90;

export const metricsQuerySchema = z.object({
  days: z
    .enum(['30', '90', '0'])
    .default('90')
    .transform((value) => Number(value) as MetricsPeriod),
});
export type MetricsQuery = z.output<typeof metricsQuerySchema>;

/**
 * "Resposta" da empresa = o primeiro evento depois da candidatura que veio
 * dela: entrou em processo, proposta ou recusa. Desistir é seu, não conta.
 */
export const RESPONSE_STATUSES = [
  'in_process',
  'offer',
  'rejected',
] as const satisfies readonly ApplicationStatus[];

/** Faixas do tempo até a resposta, em dias. */
export const RESPONSE_BUCKETS = [
  { label: 'até 3 dias', max: 3 },
  { label: '4 a 7', max: 7 },
  { label: '8 a 14', max: 14 },
  { label: '15 a 30', max: 30 },
  { label: 'mais de 30', max: Infinity },
] as const;

/** Sem resposta há mais disto, a candidatura conta como "esfriando". */
export const WAITING_STALE_DAYS = 14;

export interface SourceMetricsDto {
  sourceId: string;
  /** Vagas que entraram no período. */
  found: number;
  /** Delas, as que não são incompatíveis. */
  compatible: number;
  saved: number;
  /** Candidaturas feitas no período a vagas desta fonte. */
  applied: number;
  /** Delas, as que tiveram resposta. */
  responded: number;
}

export interface StackMetricDto {
  name: string;
  /** Em quantas vagas do período aparece. */
  jobs: number;
  /** jobs / total de vagas do período (0 a 1). */
  share: number;
  inResume: boolean;
}

export interface MetricsDto {
  /** null = tudo. */
  days: number | null;
  /** Início do período (null = tudo). */
  since: string | null;
  sources: SourceMetricsDto[];
  stacks: {
    /** Vagas que entraram no período (a base dos percentuais). */
    jobs: number;
    /** As 15 mais pedidas. */
    top: StackMetricDto[];
    /** As mais pedidas que não estão no currículo (até 10). */
    missing: StackMetricDto[];
    /** O currículo tem alguma tecnologia reconhecida? (sem isso, "faltam" não diz nada). */
    resumeHasStacks: boolean;
  };
  responses: {
    /** Candidaturas feitas no período. */
    applications: number;
    responded: number;
    /** Mediana de dias até a primeira resposta (null sem respostas). */
    medianDays: number | null;
    buckets: { label: string; count: number }[];
    /** Ainda "Aplicada", sem resposta. */
    waiting: number;
    /** Delas, há mais de WAITING_STALE_DAYS dias. */
    waitingStale: number;
  };
  /** Semana (segunda-feira, AAAA-MM-DD) → enviadas e quantas tiveram resposta. */
  weekly: { week: string; sent: number; responded: number }[];
}

/** Índice da faixa de `days` em RESPONSE_BUCKETS. */
export function responseBucket(days: number): number {
  return RESPONSE_BUCKETS.findIndex((bucket) => days <= bucket.max);
}

/** Mediana com uma casa decimal (null em lista vazia). */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  return Math.round(value * 10) / 10;
}

/** Segunda-feira da semana de `day` ("AAAA-MM-DD" → "AAAA-MM-DD"). */
export function weekStart(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
}

/** As segundas-feiras de `from` até `to`, inclusive. */
export function weeksBetween(from: string, to: string): string[] {
  const weeks: string[] = [];
  const end = weekStart(to);
  for (let week = weekStart(from); week <= end;) {
    weeks.push(week);
    week = new Date(new Date(`${week}T00:00:00Z`).getTime() + 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);
  }
  return weeks;
}

/** Taxa em % inteira (null sem base). */
export const rate = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 100) : null;
