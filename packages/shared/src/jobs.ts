import { z } from 'zod';
import type { ApplicationStatus } from './applications';
import { dateInputSchema, optionalText, pageQuerySchema, queryList } from './common';
import {
  contractTypeSchema,
  salaryPeriodSchema,
  seniorityLevelSchema,
  triageStatusSchema,
  workModelSchema,
  type ContractType,
  type SalaryPeriod,
  type SeniorityLevel,
  type TriageStatus,
  type WorkModel,
} from './enums';

/** Fonte gravada nas vagas cadastradas à mão. */
export const MANUAL_SOURCE = 'manual';

/**
 * Stack padronizada: minúsculas, sem espaço nas pontas, sem repetição,
 * mantendo a ordem. "TypeScript" e " typescript " viram a mesma coisa —
 * senão o filtro por stack falharia por diferença de digitação.
 */
export function normalizeStack(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const tech = value.trim().toLowerCase();
    if (tech && !seen.has(tech)) {
      seen.add(tech);
      result.push(tech);
    }
  }

  return result;
}

/* ------------------------------------------------------------- entrada */

/** URL opcional: string vazia (campo de formulário apagado) vale como `null`. */
const urlInput = z.preprocess(
  (value) => (value === '' ? null : value),
  z
    .url({ protocol: /^https?$/, message: 'Informe uma URL http(s) válida' })
    .max(2000)
    .nullable(),
);

const salaryValue = z.number().int().nonnegative().max(10_000_000);

/** Campos editáveis de uma vaga, sem defaults (servem para criar e editar). */
const jobFields = z.object({
  title: z.string().trim().min(1).max(200),
  company: z.string().trim().min(1).max(200),
  url: urlInput.optional(),
  description: optionalText(20_000),
  location: optionalText(200),
  notes: optionalText(5_000),
  workModel: workModelSchema.nullable().optional(),
  contractType: contractTypeSchema.nullable().optional(),
  seniority: seniorityLevelSchema.nullable().optional(),
  stack: z.array(z.string().max(40)).max(50).transform(normalizeStack),
  salaryMin: salaryValue.nullable().optional(),
  salaryMax: salaryValue.nullable().optional(),
  salaryCurrency: z.string().trim().toUpperCase().length(3).nullable().optional(),
  salaryPeriod: salaryPeriodSchema.nullable().optional(),
  postedAt: dateInputSchema.nullable().optional(),
});

function checkSalaryRange(
  value: { salaryMin?: number | null; salaryMax?: number | null },
  ctx: z.RefinementCtx,
): void {
  if (value.salaryMin != null && value.salaryMax != null && value.salaryMin > value.salaryMax) {
    ctx.addIssue({
      code: 'custom',
      path: ['salaryMax'],
      message: 'O salário máximo não pode ser menor que o mínimo',
    });
  }
}

export const createJobInputSchema = jobFields
  .extend({ stack: jobFields.shape.stack.default([]) })
  .superRefine(checkSalaryRange);
export type CreateJobInput = z.output<typeof createJobInputSchema>;

/** PATCH: tudo opcional; ausente = não mexe, `null` = limpa. */
export const updateJobInputSchema = jobFields.partial().superRefine(checkSalaryRange);
export type UpdateJobInput = z.output<typeof updateJobInputSchema>;

export const jobListQuerySchema = pageQuerySchema.extend({
  q: z
    .string()
    .trim()
    .max(200)
    .transform((value) => value || undefined)
    .optional(),
  workModel: queryList(workModelSchema),
  contractType: queryList(contractTypeSchema),
  seniority: queryList(seniorityLevelSchema),
  source: queryList(z.string().min(1).max(50)),
  stack: queryList(
    z
      .string()
      .max(40)
      .transform((value) => value.toLowerCase()),
  ),
  postedWithinDays: z.coerce.number().int().min(1).max(365).optional(),
  /** Padrão: `inbox,saved` (descartadas só quando pedidas). */
  triage: queryList(triageStatusSchema),
});
export type JobListQuery = z.output<typeof jobListQuerySchema>;

/** Triagem de uma vaga. `reason` só vale para `dismissed`. Desfazer = `inbox`. */
export const triageInputSchema = z.object({
  status: triageStatusSchema,
  reason: optionalText(200),
});
export type TriageInput = z.output<typeof triageInputSchema>;

export const MAX_BULK_TRIAGE = 200;

export const bulkTriageInputSchema = triageInputSchema.extend({
  ids: z.array(z.string().min(1)).min(1).max(MAX_BULK_TRIAGE),
});
export type BulkTriageInput = z.output<typeof bulkTriageInputSchema>;

/* --------------------------------------------------------------- saída */

export interface JobDto {
  id: string;
  source: string;
  externalId: string | null;
  url: string | null;
  title: string;
  company: string;
  description: string | null;
  location: string | null;
  notes: string | null;
  workModel: WorkModel | null;
  contractType: ContractType | null;
  seniority: SeniorityLevel | null;
  stack: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: SalaryPeriod | null;
  postedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  updatedAt: string;
  triage: TriageStatus;
  triagedAt: string | null;
  dismissReason: string | null;
  /** Resumo da candidatura, se houver — a lista mostra sem outra requisição. */
  application: { id: string; status: ApplicationStatus } | null;
}

/** Resultado de `JobsService.ingest` — usado pelas fontes. */
export interface IngestResult {
  received: number;
  created: number;
  /** Vagas que já existiam e tiveram o `lastSeenAt` atualizado. */
  seen: number;
}

export interface BulkTriageResult {
  updated: number;
  /** Ids não alterados: inexistentes ou com candidatura (não podem ser descartados). */
  skipped: string[];
}
