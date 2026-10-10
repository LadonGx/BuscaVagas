import { z } from 'zod';

/**
 * Formato de UMA vaga como a API pública da Gupy devolve. Só os campos que o
 * mapper usa; quase tudo `nullish` porque a Gupy omite ou manda `null` com
 * frequência. Ver README.md desta pasta.
 */
export const gupyJobSchema = z.object({
  id: z.union([z.number(), z.string()]).nullish(),
  /** Título da vaga. */
  name: z.string(),
  /** Página da vaga no portal da empresa (<empresa>.gupy.io). */
  jobUrl: z.string().nullish(),
  /** Nome alternativo do link citado em relatos do endpoint novo (não visto na amostra real). */
  url: z.string().nullish(),
  /** Nome da empresa como aparece na página de carreiras. */
  careerPageName: z.string().nullish(),
  /** HTML. */
  description: z.string().nullish(),
  /** Tipo de vaga: "vacancy_type_effective", "vacancy_legal_entity"... */
  type: z.string().nullish(),
  publishedDate: z.string().nullish(),
  /** SINGULAR: "remote" | "hybrid" | "on-site" (não existe "workplaceTypes"). */
  workplaceType: z.string().nullish(),
  isRemoteWork: z.boolean().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  /** Sumiu no endpoint novo; mantido para não quebrar se voltar. */
  country: z.string().nullish(),
  /** Também sumiu no endpoint novo — ver `isConfidentialGupyJob`. */
  isConfidentialCareerPage: z.boolean().nullish(),
  /** Logo da página de carreiras; `.../confidencial_logo.png` = empresa anônima. */
  careerPageLogo: z.string().nullish(),
});
export type GupyJob = z.infer<typeof gupyJobSchema>;

/** Envelope da resposta. `pagination.total` existe mas NÃO serve (ver README). */
export const gupyPageSchema = z.object({
  data: z.array(z.unknown()),
});
