import { z } from 'zod';
import {
  contractTypeSchema,
  salaryPeriodSchema,
  seniorityLevelSchema,
  workModelSchema,
} from './enums';

export const salaryRangeSchema = z.object({
  min: z.number().int().nonnegative().nullable(),
  max: z.number().int().nonnegative().nullable(),
  /** ISO 4217, ex.: BRL, USD. */
  currency: z.string().length(3),
  period: salaryPeriodSchema,
});
export type SalaryRange = z.infer<typeof salaryRangeSchema>;

/**
 * A vaga no formato padronizado do projeto.
 *
 * É o contrato de saída de TODA fonte em `packages/sources`: cada site tem
 * seu próprio formato, e o mapper da fonte converte para isto. Daqui em
 * diante (fila, banco, front) ninguém sabe de onde a vaga veio, a não ser
 * pelo campo `source`.
 *
 * Campo que a fonte não informa é `null`, nunca um palpite: um `null` honesto
 * permite à ordenação tratar "sem dado" diferente de "dado ruim".
 */
export const jobPostingSchema = z.object({
  /** Id da fonte que trouxe a vaga, ex.: "gupy", "greenhouse". */
  source: z.string().min(1),
  /** Id da vaga dentro da fonte, quando ela expõe um. */
  externalId: z.string().min(1).nullable(),
  /** URL canônica da vaga — é a chave de deduplicação. */
  url: z.url(),
  title: z.string().min(1),
  company: z.string().min(1),
  /** Texto puro, já sem HTML e truncado. */
  description: z.string().nullable(),
  location: z.string().nullable(),
  workModel: workModelSchema.nullable(),
  contractType: contractTypeSchema.nullable(),
  seniority: seniorityLevelSchema.nullable(),
  /** Tecnologias detectadas no título/descrição, normalizadas em minúsculas. */
  stack: z.array(z.string().min(1)),
  salary: salaryRangeSchema.nullable(),
  /** Data de publicação (ISO 8601). Nunca a data de "última edição". */
  postedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type JobPosting = z.infer<typeof jobPostingSchema>;
