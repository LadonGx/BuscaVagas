import type { JobPosting } from '@busca-vagas/shared';
import type { JobSource, SourceContext, SourceQuery, SourceResult } from '../core/job-source';
import { parseEach } from '../core/parse-each';
import { mapTemplateJob, TEMPLATE_SOURCE_ID } from './template.mapper';
import { templatePageSchema } from './template.schema';

const ENDPOINT = 'https://jobs.example.com/api/jobs';
const MAX_PAGES = 3;

/**
 * Fonte de exemplo, do tipo `search`: pagina um endpoint JSON por termo.
 *
 * Regras que toda fonte segue:
 *  - toda requisição passa por `ctx.http` e repassa `ctx.signal`;
 *  - resposta inesperada encerra a paginação, não lança;
 *  - teto de páginas fixo — nada de "ler até acabar".
 */
export class TemplateSource implements JobSource {
  readonly id = TEMPLATE_SOURCE_ID;
  readonly displayName = 'Exemplo';
  readonly kind = 'search' as const;

  async fetch(query: SourceQuery, ctx: SourceContext): Promise<SourceResult> {
    const term = query.term?.trim() || 'desenvolvedor';
    const jobs: JobPosting[] = [];
    let dropped = 0;

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const url = `${ENDPOINT}?q=${encodeURIComponent(term)}&page=${page}`;
      const payload = templatePageSchema.safeParse(
        await ctx.http.getJson(url, { signal: ctx.signal }),
      );

      if (!payload.success) {
        ctx.log(`${this.id}: página ${page} com formato inesperado`);
        break;
      }

      const result = parseEach(payload.data.jobs, mapTemplateJob);
      jobs.push(...result.ok);
      dropped += result.dropped;

      if (!payload.data.has_more) {
        break;
      }
    }

    return { jobs, dropped };
  }
}
