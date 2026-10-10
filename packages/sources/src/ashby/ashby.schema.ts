import { z } from 'zod';

/** Endereço: às vezes dentro de `postalAddress`, às vezes direto (locais secundários). */
const ashbyAddressSchema = z
  .object({
    addressLocality: z.string().nullish(),
    addressRegion: z.string().nullish(),
    addressCountry: z.string().nullish(),
    postalAddress: z
      .object({
        addressLocality: z.string().nullish(),
        addressRegion: z.string().nullish(),
        addressCountry: z.string().nullish(),
      })
      .nullish(),
  })
  .nullish();
export type AshbyAddress = z.infer<typeof ashbyAddressSchema>;

/**
 * Uma vaga da Posting API do Ashby (`/posting-api/job-board/<slug>`).
 * Só os campos usados; quase tudo `nullish`. Ver README.md desta pasta.
 */
export const ashbyJobSchema = z.object({
  id: z.string().nullish(),
  title: z.string(),
  jobUrl: z.string(),
  /** Local principal, em texto ("São Paulo", "Remote - LATAM"). */
  location: z.string().nullish(),
  address: ashbyAddressSchema,
  secondaryLocations: z
    .array(z.object({ location: z.string().nullish(), address: ashbyAddressSchema }))
    .nullish(),
  isListed: z.boolean().nullish(),
  isRemote: z.boolean().nullish(),
  /** "OnSite" | "Remote" | "Hybrid". */
  workplaceType: z.string().nullish(),
  /** "FullTime" | "PartTime" | "Intern" | "Contract" | "Temporary". */
  employmentType: z.string().nullish(),
  publishedAt: z.string().nullish(),
  descriptionHtml: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
  compensation: z
    .object({
      summaryComponents: z
        .array(
          z.object({
            /** "Salary", "EquityPercentage", "Bonus"... */
            compensationType: z.string().nullish(),
            /** "1 YEAR", "1 MONTH", "1 HOUR"... */
            interval: z.string().nullish(),
            currencyCode: z.string().nullish(),
            minValue: z.number().nullish(),
            maxValue: z.number().nullish(),
          }),
        )
        .nullish(),
    })
    .nullish(),
});
export type AshbyJob = z.infer<typeof ashbyJobSchema>;

export const ashbyBoardSchema = z.object({
  jobs: z.array(z.unknown()),
});
