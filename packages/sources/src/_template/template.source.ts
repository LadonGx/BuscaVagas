import type { JobPosting } from '@busca-vagas/shared';
import type { JobSource, SourceContext, SourceQuery, SourceResult } from '../core/job-source';
import { parseEach } from '../core/parse-each';
import type { TemplateConfig } from './template.config';
import { mapTemplateJob, TEMPLATE_SOURCE_ID } from './template.mapper';
import { templatePageSchema } from './template.schema';

const ENDPOINT = 'https://jobs.example.com/api/jobs';
const DEFAULT_TERMS = ['desenvolvedor'];

/**
 * Fonte de exemplo, do tipo `search`: pagina um endpoint JSON, uma busca por termo.
 *
 * Regras que toda fonte segue:
 *  - toda requisição passa por `ctx.http` e repassa `ctx.signal`;
 *  - resposta inesperada encerra a paginação daquele termo, não lança;
 *  - teto de páginas fixo — nada de "ler até acabar";
 *  - a mesma vaga achada por dois termos entra uma vez só.
 */
export class TemplateSource implements JobSource {
  readonly id = TEMPLATE_SOURCE_ID;
  readonly displayName = 'Exemplo';
  readonly kind = 'search' as const;

  constructor(private readonly config: TemplateConfig = { maxPages: 3 }) {}

  async fetch(query: SourceQuery, ctx: SourceContext): Promise<SourceResult> {
    const terms = query.terms?.length ? query.terms : DEFAULT_TERMS;
    const byUrl = new Map<string, JobPosting>();
    let dropped = 0;

    for (const term of terms) {
      for (let page = 1; page <= this.config.maxPages; page += 1) {
        const url = `${ENDPOINT}?q=${encodeURIComponent(term)}&page=${page}`;
        const payload = templatePageSchema.safeParse(
          await ctx.http.getJson(url, { signal: ctx.signal }),
        );

        if (!payload.success) {
          ctx.log(`${this.id}: "${term}" página ${page} com formato inesperado`);
          break;
        }

        const result = parseEach(payload.data.jobs, mapTemplateJob);
        for (const job of result.ok) {
          byUrl.set(job.url, job);
        }
        dropped += result.dropped;

        if (!payload.data.has_more) {
          break;
        }
      }
    }

    return { jobs: [...byUrl.values()], dropped };
  }
}
