import { z } from 'zod';

/**
 * Formato de UM item como o site devolve. Declare só os campos que o mapper
 * usa: campo a mais no schema é campo a mais para quebrar quando o site mudar.
 * Use `.nullish()` para o que o site às vezes omite.
 */
export const templateJobSchema = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string().min(1),
  company: z.string().min(1),
  url: z.string().min(1),
  remote: z.boolean().nullish(),
  city: z.string().nullish(),
  published_at: z.string().nullish(),
  description: z.string().nullish(),
});
export type TemplateJob = z.infer<typeof templateJobSchema>;

/** Envelope da resposta (paginação, metadados...). */
export const templatePageSchema = z.object({
  jobs: z.array(z.unknown()),
  has_more: z.boolean(),
});
