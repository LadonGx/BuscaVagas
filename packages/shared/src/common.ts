import { z } from 'zod';

/** Resposta padrão das listagens paginadas por cursor. */
export interface Page<T> {
  items: T[];
  /** `null` quando não há mais páginas. */
  nextCursor: string | null;
}

export const DEFAULT_PAGE_LIMIT = 30;
export const MAX_PAGE_LIMIT = 100;

export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
  cursor: z.string().min(1).optional(),
});

/**
 * Lista vinda da query string. Aceita `?x=a&x=b` e `?x=a,b`; vazio vira
 * `undefined` (filtro não aplicado).
 */
export function queryList<T extends z.ZodType>(item: T) {
  return z.preprocess((value) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const raw = Array.isArray(value) ? value : [value];
    const parts = raw
      .flatMap((entry) => String(entry).split(','))
      .map((entry) => entry.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts : undefined;
  }, z.array(item).optional());
}

/**
 * Texto opcional de formulário: apara espaços e trata string vazia como
 * `null`. Em PATCH, ausente = não mexe; `null` ou `""` = limpa.
 */
export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();
}

/** Data de entrada: ISO completo (`2026-10-09T14:00:00-03:00`) ou só o dia (`2026-10-09`). */
export const dateInputSchema = z
  .union([z.iso.datetime({ offset: true }), z.iso.date()])
  .transform((value) => new Date(value));

/** Data de saída nos DTOs: sempre string ISO (é o que o JSON entrega). */
export const isoDateTimeSchema = z.iso.datetime({ offset: true });
