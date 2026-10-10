import { z } from 'zod';

/**
 * Uma vaga da Job Board API do Greenhouse (`/v1/boards/<slug>/jobs?content=true`).
 * Só os campos usados; quase tudo `nullish`. Ver README.md desta pasta.
 */
export const greenhouseJobSchema = z.object({
  id: z.union([z.number(), z.string()]),
  title: z.string(),
  /** Página da vaga: no Greenhouse ou no site da empresa (`?gh_jid=`). */
  absolute_url: z.string(),
  location: z.object({ name: z.string().nullish() }).nullish(),
  /** HTML ESCAPADO: `&lt;p&gt;`. */
  content: z.string().nullish(),
  /** Data de publicação. `updated_at` é data de edição — não usar. */
  first_published: z.string().nullish(),
  company_name: z.string().nullish(),
  offices: z
    .array(z.object({ name: z.string().nullish(), location: z.string().nullish() }))
    .nullish(),
});
export type GreenhouseJob = z.infer<typeof greenhouseJobSchema>;

export const greenhouseBoardSchema = z.object({
  jobs: z.array(z.unknown()),
});
