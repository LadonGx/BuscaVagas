import type { JobPosting } from '@busca-vagas/shared';
import type { JobSource, SourceContext, SourceQuery, SourceResult } from '../core/job-source';
import { parseEach } from '../core/parse-each';
import { sleep } from '../core/sleep';
import { DEFAULT_GUPY_CONFIG, type GupyConfig } from './gupy.config';
import { GUPY_SOURCE_ID, mapGupyJob } from './gupy.mapper';
import { gupyPageSchema } from './gupy.schema';

/**
 * Busca do portal de vagas da Gupy (a mesma que portal.gupy.io usa).
 * Até 02/10/2026 era `employability-portal.gupy.io/api/v1/jobs`, que passou a
 * responder 404 em qualquer caminho. Parâmetros e envelope continuaram iguais.
 */
export const GUPY_ENDPOINT = 'https://portal.gupy.io/api/job-search/jobs';

/** Máximo que a API aceita por página (limit=200 responde 400). */
export const GUPY_PAGE_SIZE = 100;

/** Sem termo, a Gupy devolve o acervo inteiro — e a maioria não é de tecnologia. */
const FALLBACK_TERMS = ['desenvolvedor'];

/**
 * Fonte Gupy: busca por termo sobre as páginas de carreira de milhares de
 * empresas brasileiras. Ver README.md desta pasta.
 *
 *  - uma busca por termo (`jobName` casa só com o título);
 *  - página incompleta = fim (o `pagination.total` da API não serve);
 *  - teto de páginas e pausa entre requisições;
 *  - um termo que falha não derruba os outros; só lança se TODOS falharem.
 */
export class GupySource implements JobSource {
  readonly id = GUPY_SOURCE_ID;
  readonly displayName = 'Gupy';
  readonly kind = 'search' as const;
  /** Vários termos × várias páginas com pausa: bem mais que o prazo padrão. */
  readonly timeoutMs = 120_000;

  constructor(private readonly config: GupyConfig = DEFAULT_GUPY_CONFIG) {}

  async fetch(query: SourceQuery, ctx: SourceContext): Promise<SourceResult> {
    const terms = query.terms?.length ? query.terms : FALLBACK_TERMS;
    const byUrl = new Map<string, JobPosting>();
    let dropped = 0;
    let requests = 0;
    let failedTerms = 0;
    let firstError: unknown = null;

    for (const term of terms) {
      try {
        for (let page = 0; page < this.config.maxPages; page += 1) {
          if (requests > 0) {
            await sleep(this.config.requestDelayMs, ctx.signal);
          }
          requests += 1;

          const payload = gupyPageSchema.safeParse(
            await ctx.http.getJson(gupyUrl(term, page), { signal: ctx.signal }),
          );

          if (!payload.success) {
            ctx.log(`gupy: "${term}" página ${page + 1} com formato inesperado — parando o termo`);
            break;
          }

          const rows = payload.data.data;
          const result = parseEach(rows, mapGupyJob);
          dropped += result.dropped;
          for (const job of result.ok) {
            // A mesma vaga aparece em vários termos: entra uma vez.
            if (!byUrl.has(job.url)) {
              byUrl.set(job.url, job);
            }
          }

          if (rows.length < GUPY_PAGE_SIZE) {
            break;
          }
        }
      } catch (error) {
        if (ctx.signal.aborted) {
          throw error;
        }
        failedTerms += 1;
        firstError ??= error;
        const reason = error instanceof Error ? error.message : String(error);
        ctx.log(`gupy: termo "${term}" falhou (${reason}) — seguindo com os outros`);
      }
    }

    if (failedTerms === terms.length && firstError) {
      throw firstError;
    }

    return { jobs: [...byUrl.values()], dropped };
  }
}

export function gupyUrl(term: string, page: number): string {
  const params = new URLSearchParams({
    jobName: term,
    offset: String(page * GUPY_PAGE_SIZE),
    limit: String(GUPY_PAGE_SIZE),
  });
  return `${GUPY_ENDPOINT}?${params}`;
}
