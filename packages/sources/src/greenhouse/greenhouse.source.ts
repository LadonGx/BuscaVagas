import type { BoardCompany } from '../core/boards/companies';
import { scanCompanies } from '../core/boards/per-company';
import type { JobSource, SourceContext, SourceQuery, SourceResult } from '../core/job-source';
import { DEFAULT_GREENHOUSE_CONFIG, type GreenhouseConfig } from './greenhouse.config';
import { GREENHOUSE_SOURCE_ID, mapGreenhouseJob } from './greenhouse.mapper';
import { greenhouseBoardSchema } from './greenhouse.schema';

export const GREENHOUSE_API = 'https://boards-api.greenhouse.io/v1/boards';

export function greenhouseUrl(slug: string): string {
  return `${GREENHOUSE_API}/${encodeURIComponent(slug)}/jobs?content=true`;
}

/**
 * Greenhouse: uma requisição por empresa, sem paginação (o board vem
 * inteiro). O loop, os filtros e o tratamento de erro são os de todo board
 * (`core/boards/per-company.ts`). Ver README.md desta pasta.
 */
export class GreenhouseSource implements JobSource {
  readonly id = GREENHOUSE_SOURCE_ID;
  readonly displayName = 'Greenhouse';
  readonly kind = 'company-board' as const;
  readonly timeoutMs = 180_000;

  constructor(private readonly config: GreenhouseConfig = DEFAULT_GREENHOUSE_CONFIG) {}

  fetch(query: SourceQuery, ctx: SourceContext): Promise<SourceResult> {
    return scanCompanies({
      sourceId: this.id,
      config: this.config,
      query,
      ctx,
      fetchCompany: async (company: BoardCompany) => {
        const body = greenhouseBoardSchema.safeParse(
          await ctx.http.getJson(greenhouseUrl(company.slug), { signal: ctx.signal }),
        );
        if (!body.success) {
          throw new Error('resposta em formato inesperado');
        }
        return body.data.jobs;
      },
      mapItem: mapGreenhouseJob,
    });
  }
}
