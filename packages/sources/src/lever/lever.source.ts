import type { BoardCompany } from '../core/boards/companies';
import { scanCompanies } from '../core/boards/per-company';
import type { JobSource, SourceContext, SourceQuery, SourceResult } from '../core/job-source';
import { DEFAULT_LEVER_CONFIG, type LeverConfig } from './lever.config';
import { LEVER_SOURCE_ID, mapLeverPosting } from './lever.mapper';
import { leverPostingsSchema } from './lever.schema';

export const LEVER_API = 'https://api.lever.co/v0/postings';

export function leverUrl(slug: string): string {
  return `${LEVER_API}/${encodeURIComponent(slug)}?mode=json`;
}

/**
 * Lever: uma requisição por empresa; sem `limit`, a API devolve o board
 * inteiro. O loop, os filtros e o tratamento de erro são os de todo board
 * (`core/boards/per-company.ts`). Ver README.md desta pasta.
 */
export class LeverSource implements JobSource {
  readonly id = LEVER_SOURCE_ID;
  readonly displayName = 'Lever';
  readonly kind = 'company-board' as const;
  readonly timeoutMs = 180_000;

  constructor(private readonly config: LeverConfig = DEFAULT_LEVER_CONFIG) {}

  fetch(query: SourceQuery, ctx: SourceContext): Promise<SourceResult> {
    return scanCompanies({
      sourceId: this.id,
      config: this.config,
      query,
      ctx,
      fetchCompany: async (company: BoardCompany) => {
        const body = leverPostingsSchema.safeParse(
          await ctx.http.getJson(leverUrl(company.slug), { signal: ctx.signal }),
        );
        if (!body.success) {
          throw new Error('resposta em formato inesperado');
        }
        return body.data;
      },
      mapItem: mapLeverPosting,
    });
  }
}
