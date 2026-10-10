import type { BoardCompany } from '../core/boards/companies';
import { scanCompanies } from '../core/boards/per-company';
import type { JobSource, SourceContext, SourceQuery, SourceResult } from '../core/job-source';
import { DEFAULT_ASHBY_CONFIG, type AshbyConfig } from './ashby.config';
import { ASHBY_SOURCE_ID, mapAshbyJob } from './ashby.mapper';
import { ashbyBoardSchema } from './ashby.schema';

export const ASHBY_API = 'https://api.ashbyhq.com/posting-api/job-board';

export function ashbyUrl(slug: string): string {
  return `${ASHBY_API}/${encodeURIComponent(slug)}?includeCompensation=true`;
}

/**
 * Ashby: uma requisição por empresa, sem paginação. O loop, os filtros e o
 * tratamento de erro são os de todo board (`core/boards/per-company.ts`).
 * Ver README.md desta pasta.
 */
export class AshbySource implements JobSource {
  readonly id = ASHBY_SOURCE_ID;
  readonly displayName = 'Ashby';
  readonly kind = 'company-board' as const;
  readonly timeoutMs = 180_000;

  constructor(private readonly config: AshbyConfig = DEFAULT_ASHBY_CONFIG) {}

  fetch(query: SourceQuery, ctx: SourceContext): Promise<SourceResult> {
    return scanCompanies({
      sourceId: this.id,
      config: this.config,
      query,
      ctx,
      fetchCompany: async (company: BoardCompany) => {
        const body = ashbyBoardSchema.safeParse(
          await ctx.http.getJson(ashbyUrl(company.slug), { signal: ctx.signal }),
        );
        if (!body.success) {
          throw new Error('resposta em formato inesperado');
        }
        return body.data.jobs;
      },
      mapItem: mapAshbyJob,
    });
  }
}
