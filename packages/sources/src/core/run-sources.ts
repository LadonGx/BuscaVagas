import type { JobPosting } from '@busca-vagas/shared';
import type { HttpClient } from './http';
import type { JobSource, SourceQuery } from './job-source';

export interface SourceOutcome {
  sourceId: string;
  status: 'ok' | 'failed';
  jobs: number;
  dropped: number;
  durationMs: number;
  error?: string;
}

export interface RunSourcesResult {
  /** Vagas de todas as fontes, sem duplicatas de URL. */
  jobs: JobPosting[];
  outcomes: SourceOutcome[];
}

const DEFAULT_SOURCE_TIMEOUT_MS = 15_000;

/**
 * Roda uma fonte isolada, com prazo próprio. Nunca lança: falha vira
 * `status: 'failed'` no resultado. É o que a fila chama, uma fonte por job.
 */
export async function runSource(
  source: JobSource,
  query: SourceQuery,
  http: HttpClient,
  log: (message: string) => void = () => {},
): Promise<{ jobs: JobPosting[]; outcome: SourceOutcome }> {
  const started = Date.now();
  const timeoutMs = source.timeoutMs ?? DEFAULT_SOURCE_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await Promise.race([
      source.fetch(query, { http, signal: controller.signal, log }),
      new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener('abort', () =>
          reject(new Error(`prazo de ${timeoutMs}ms estourado`)),
        );
      }),
    ]);

    return {
      jobs: result.jobs,
      outcome: {
        sourceId: source.id,
        status: 'ok',
        jobs: result.jobs.length,
        dropped: result.dropped,
        durationMs: Date.now() - started,
      },
    };
  } catch (error) {
    return {
      jobs: [],
      outcome: {
        sourceId: source.id,
        status: 'failed',
        jobs: 0,
        dropped: 0,
        durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Roda várias fontes em paralelo. Uma fonte fora do ar vira um `failed` na
 * lista de resultados — as outras seguem. Duplicatas entre fontes ficam com
 * a versão da fonte que aparece primeiro em `sources`.
 */
export async function runSources(
  sources: readonly JobSource[],
  query: SourceQuery,
  http: HttpClient,
  log?: (message: string) => void,
): Promise<RunSourcesResult> {
  const results = await Promise.all(sources.map((source) => runSource(source, query, http, log)));

  const seen = new Set<string>();
  const jobs: JobPosting[] = [];

  for (const result of results) {
    for (const job of result.jobs) {
      if (!seen.has(job.url)) {
        seen.add(job.url);
        jobs.push(job);
      }
    }
  }

  return { jobs, outcomes: results.map((result) => result.outcome) };
}
