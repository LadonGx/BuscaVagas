import { z } from 'zod';
import { dateInputSchema, optionalText, pageQuerySchema, queryList } from './common';
import type { WorkModel } from './enums';

/* -------------------------------------------------------------- status */

/**
 * Etapas da candidatura (versão enxuta). Transições livres: qualquer status
 * pode ir para qualquer outro — o histórico registra tudo.
 * Plano: docs/features/03-applications.md
 */
export const APPLICATION_STATUSES = [
  'applied',
  'in_process',
  'offer',
  'rejected',
  'withdrawn',
] as const;
export const applicationStatusSchema = z.enum(APPLICATION_STATUSES);
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: 'Aplicada',
  in_process: 'Em processo',
  offer: 'Proposta',
  rejected: 'Recusada',
  withdrawn: 'Desisti',
};

/* ------------------------------------------------------ regra do histórico */

export interface StatusEventLike {
  status: ApplicationStatus;
  occurredAt: Date;
  createdAt: Date;
}

/** Ordem cronológica: quando aconteceu; empate, quando foi registrado. */
export function compareEvents(a: StatusEventLike, b: StatusEventLike): number {
  return (
    a.occurredAt.getTime() - b.occurredAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime()
  );
}

/**
 * Estado atual da candidatura a partir do histórico:
 *  - status = o do evento mais recente;
 *  - appliedAt = a data do primeiro evento.
 *
 * Vale para eventos registrados fora de ordem (com data retroativa).
 */
export function deriveApplicationState(events: readonly StatusEventLike[]): {
  status: ApplicationStatus;
  appliedAt: Date;
} {
  if (events.length === 0) {
    throw new Error('Candidatura sem eventos: o histórico precisa de ao menos um.');
  }

  const sorted = [...events].sort(compareEvents);
  return { status: sorted.at(-1)!.status, appliedAt: sorted[0]!.occurredAt };
}

/**
 * Ordena e anota cada evento com o status anterior. O anterior é calculado,
 * não gravado: corrigir a data de um evento nunca deixa o histórico incoerente.
 */
export function withPreviousStatus<E extends StatusEventLike>(
  events: readonly E[],
): (E & { previousStatus: ApplicationStatus | null })[] {
  return [...events].sort(compareEvents).map((event, index, sorted) => ({
    ...event,
    previousStatus: index === 0 ? null : sorted[index - 1]!.status,
  }));
}

/* ------------------------------------------------------------- entrada */

/** Tolerância para relógio adiantado/atrasado entre front e API. */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/** Data de um evento: não pode estar no futuro (futuro é "próxima etapa"). */
export const occurredAtSchema = dateInputSchema.refine(
  (date) => date.getTime() <= Date.now() + FUTURE_TOLERANCE_MS,
  { message: 'A data do evento não pode estar no futuro — use a próxima etapa' },
);

const salaryExpectation = z.number().int().nonnegative().max(10_000_000).nullable().optional();

export const createApplicationInputSchema = z.object({
  jobId: z.string().min(1),
  status: applicationStatusSchema.default('applied'),
  /** Quando você se candidatou. Padrão: agora. */
  occurredAt: occurredAtSchema.optional(),
  appliedVia: optionalText(100),
  salaryExpectation,
  notes: optionalText(5_000),
});
export type CreateApplicationInput = z.output<typeof createApplicationInputSchema>;

/** PATCH: ausente = não mexe; `null` = limpa. Status muda só por evento. */
export const updateApplicationInputSchema = z.object({
  appliedVia: optionalText(100),
  salaryExpectation,
  notes: optionalText(5_000),
  nextStepAt: dateInputSchema.nullable().optional(),
  nextStepNote: optionalText(500),
});
export type UpdateApplicationInput = z.output<typeof updateApplicationInputSchema>;

export const addStatusEventInputSchema = z.object({
  status: applicationStatusSchema,
  occurredAt: occurredAtSchema.optional(),
  note: optionalText(1_000),
});
export type AddStatusEventInput = z.output<typeof addStatusEventInputSchema>;

export const updateStatusEventInputSchema = z.object({
  status: applicationStatusSchema.optional(),
  occurredAt: occurredAtSchema.optional(),
  note: optionalText(1_000),
});
export type UpdateStatusEventInput = z.output<typeof updateStatusEventInputSchema>;

export const applicationListQuerySchema = pageQuerySchema.extend({
  status: queryList(applicationStatusSchema),
  q: z
    .string()
    .trim()
    .max(200)
    .transform((value) => value || undefined)
    .optional(),
});
export type ApplicationListQuery = z.output<typeof applicationListQuerySchema>;

/* --------------------------------------------------------------- saída */

export interface ApplicationJobSummary {
  id: string;
  title: string;
  company: string;
  url: string | null;
  location: string | null;
  workModel: WorkModel | null;
}

export interface StatusEventDto {
  id: string;
  status: ApplicationStatus;
  previousStatus: ApplicationStatus | null;
  occurredAt: string;
  note: string | null;
  createdAt: string;
}

export interface ApplicationDto {
  id: string;
  jobId: string;
  status: ApplicationStatus;
  appliedAt: string;
  appliedVia: string | null;
  salaryExpectation: number | null;
  notes: string | null;
  nextStepAt: string | null;
  nextStepNote: string | null;
  createdAt: string;
  updatedAt: string;
  job: ApplicationJobSummary;
}

/** Detalhe: inclui a linha do tempo, do evento mais antigo ao mais recente. */
export interface ApplicationDetailDto extends ApplicationDto {
  events: StatusEventDto[];
}

/** Contagem por status, para o quadro de candidaturas. */
export type ApplicationSummaryDto = Record<ApplicationStatus, number> & { total: number };
