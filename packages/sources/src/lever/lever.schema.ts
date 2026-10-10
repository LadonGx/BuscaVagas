import { z } from 'zod';

/**
 * Uma vaga da Postings API do Lever (`/v0/postings/<slug>?mode=json`).
 * Só os campos usados; quase tudo `nullish`. Ver README.md desta pasta.
 */
export const leverPostingSchema = z.object({
  id: z.string().nullish(),
  /** Título. */
  text: z.string(),
  hostedUrl: z.string(),
  categories: z
    .object({
      location: z.string().nullish(),
      /** Jornada: "Full-time", "Intern", "Contractor"... */
      commitment: z.string().nullish(),
      allLocations: z.array(z.string()).nullish(),
    })
    .nullish(),
  /** ISO 3166-1 alpha-2 ("BR") ou null. */
  country: z.string().nullish(),
  /** "remote" | "hybrid" | "on-site" | "unspecified". */
  workplaceType: z.string().nullish(),
  /** Milissegundos desde 1970. */
  createdAt: z.number().nullish(),
  /** HTML. */
  description: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
  /** Blocos "Requisitos", "O que oferecemos"... — `content` em HTML (itens <li>). */
  lists: z.array(z.object({ text: z.string().nullish(), content: z.string().nullish() })).nullish(),
  /** HTML. */
  additional: z.string().nullish(),
  salaryRange: z
    .object({
      min: z.number().nullish(),
      max: z.number().nullish(),
      currency: z.string().nullish(),
      /** "per-year-salary" | "per-month-salary" | "per-hour-wage"... */
      interval: z.string().nullish(),
    })
    .nullish(),
});
export type LeverPosting = z.infer<typeof leverPostingSchema>;

/** A resposta é a lista pura. */
export const leverPostingsSchema = z.array(z.unknown());
