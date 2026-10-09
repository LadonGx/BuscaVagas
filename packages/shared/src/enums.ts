import { z } from 'zod';

/**
 * Valores fechados usados em todo o projeto. Ficam como `as const` + `z.enum`
 * para que o mesmo array gere o tipo TypeScript, a validação e, mais tarde,
 * as opções dos filtros no front.
 */

export const WORK_MODELS = ['remote', 'hybrid', 'onsite'] as const;
export const workModelSchema = z.enum(WORK_MODELS);
export type WorkModel = z.infer<typeof workModelSchema>;

/** Tipos de contrato do mercado brasileiro. */
export const CONTRACT_TYPES = ['clt', 'pj', 'internship', 'temporary', 'other'] as const;
export const contractTypeSchema = z.enum(CONTRACT_TYPES);
export type ContractType = z.infer<typeof contractTypeSchema>;

export const SENIORITY_LEVELS = ['intern', 'trainee', 'junior', 'mid', 'senior', 'lead'] as const;
export const seniorityLevelSchema = z.enum(SENIORITY_LEVELS);
export type SeniorityLevel = z.infer<typeof seniorityLevelSchema>;

export const SALARY_PERIODS = ['hour', 'month', 'year'] as const;
export const salaryPeriodSchema = z.enum(SALARY_PERIODS);
export type SalaryPeriod = z.infer<typeof salaryPeriodSchema>;

/** Triagem da vaga: `inbox` = ainda não triada. */
export const TRIAGE_STATUSES = ['inbox', 'saved', 'dismissed'] as const;
export const triageStatusSchema = z.enum(TRIAGE_STATUSES);
export type TriageStatus = z.infer<typeof triageStatusSchema>;

/** O que a listagem mostra quando o filtro `triage` não é informado. */
export const DEFAULT_TRIAGE_FILTER: TriageStatus[] = ['inbox', 'saved'];
