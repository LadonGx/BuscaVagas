import type { JobPosting } from '@busca-vagas/shared';
import { z } from 'zod';
import { HttpError } from '../http';
import {
  parseSourceEnv,
  type EnvLike,
  type SourceContext,
  type SourceQuery,
  type SourceResult,
} from '../job-source';
import { parseEach } from '../parse-each';
import { sleep } from '../sleep';
import { companyListSchema, parseCompanyList, type BoardCompany } from './companies';
import { createBoardFilter, parseBoardFilters, type BoardFilters, type BoardItem } from './filters';

/** Configuração de toda fonte `company-board`. */
export interface CompanyBoardConfig {
  companies: readonly BoardCompany[];
  /** Pausa entre uma empresa e a próxima. */
  requestDelayMs: number;
  filters: BoardFilters;
}

const boardSourceEnvSchema = z.object({
  COMPANIES: companyListSchema,
  REQUEST_DELAY_MS: z.coerce.number().int().min(0).max(10_000).default(300),
});

/**
 * Lê `<PREFIXO>COMPANIES` e `<PREFIXO>REQUEST_DELAY_MS` + os filtros comuns
 * (`BOARDS_*`). Cada fonte chama com o próprio prefixo (`LEVER_`...).
 */
export function parseCompanyBoardConfig(prefix: string, env: EnvLike): CompanyBoardConfig {
  const raw = parseSourceEnv(prefix, boardSourceEnvSchema, env);
  return {
    companies: raw.COMPANIES,
    requestDelayMs: raw.REQUEST_DELAY_MS,
    filters: parseBoardFilters(env),
  };
}

/** Para `SourceDefinition.inactiveReason`: sem empresas, não há o que buscar. */
export function noCompaniesReason(prefix: string) {
  return (config: CompanyBoardConfig): string | null =>
    config.companies.length === 0 ? `${prefix}COMPANIES vazio — nenhuma empresa para buscar` : null;
}

export interface ScanCompaniesOptions {
  /** Id da fonte, para os logs. */
  sourceId: string;
  config: CompanyBoardConfig;
  query: SourceQuery;
  ctx: SourceContext;
  /** Busca os itens crus de UMA empresa (a lista de vagas da resposta). */
  fetchCompany: (company: BoardCompany) => Promise<readonly unknown[]>;
  /** Item cru → vaga + local, ou `null` se não serve (conta como descartado). */
  mapItem: (raw: unknown, company: BoardCompany) => BoardItem | null;
}

/**
 * O loop que as três fontes de board compartilham:
 *
 *  - empresas de `query.companies` (o `try`) ou da configuração;
 *  - pausa entre empresas;
 *  - empresa com erro (404 = slug errado) vira aviso e as outras seguem;
 *    só lança se TODAS falharem;
 *  - filtros de título e local, contados em `filtered`;
 *  - a mesma URL entra uma vez.
 */
export async function scanCompanies(options: ScanCompaniesOptions): Promise<SourceResult> {
  const { sourceId, config, query, ctx } = options;
  const companies = query.companies?.length ? parseCompanyList(query.companies) : config.companies;
  const passes = query.skipFilters ? () => true : createBoardFilter(config.filters);

  const byUrl = new Map<string, JobPosting>();
  let dropped = 0;
  let filtered = 0;
  let failed = 0;
  let firstError: unknown = null;

  if (companies.length === 0) {
    ctx.log(`${sourceId}: nenhuma empresa configurada`);
    return { jobs: [], dropped: 0, filtered: 0 };
  }

  for (const [index, company] of companies.entries()) {
    if (index > 0) {
      await sleep(config.requestDelayMs, ctx.signal);
    }

    try {
      const rows = await options.fetchCompany(company);
      const result = parseEach(rows, (raw) => options.mapItem(raw, company));
      let kept = 0;

      for (const item of result.ok) {
        if (!passes(item)) {
          filtered += 1;
          continue;
        }
        kept += 1;
        if (!byUrl.has(item.posting.url)) {
          byUrl.set(item.posting.url, item.posting);
        }
      }

      dropped += result.dropped;
      ctx.log(
        `${sourceId}: ${company.slug} — ${rows.length} vagas, ${kept} mantidas, ` +
          `${result.ok.length - kept} filtradas, ${result.dropped} descartadas`,
      );
    } catch (error) {
      if (ctx.signal.aborted) {
        throw error;
      }
      failed += 1;
      firstError ??= error;

      if (error instanceof HttpError && error.status === 404) {
        ctx.log(`${sourceId}: "${company.slug}" não encontrada (404) — confira o slug`);
      } else {
        const reason = error instanceof Error ? error.message : String(error);
        ctx.log(`${sourceId}: "${company.slug}" falhou (${reason}) — seguindo com as outras`);
      }
    }
  }

  if (failed === companies.length) {
    throw firstError instanceof Error ? firstError : new Error(String(firstError));
  }

  return { jobs: [...byUrl.values()], dropped, filtered };
}

/** Nome exibido: o do `.env`, senão o da API, senão o derivado do slug. */
export function companyDisplayName(
  company: BoardCompany,
  fromApi: string | null | undefined,
  fromSlug: (slug: string) => string,
): string {
  return company.name ?? (fromApi?.trim() || fromSlug(company.slug));
}
