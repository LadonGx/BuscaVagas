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

/** Resultado de UMA empresa numa varredura — a API guarda para mostrar na tela. */
export interface CompanyScanStat {
  slug: string;
  /** `not_found` = 404: o slug não existe (ou a empresa saiu desse ATS). */
  status: 'ok' | 'not_found' | 'failed';
  /** Vagas que o board tinha (válidas ou não). */
  jobs: number;
  /** Quantas passaram nos filtros de título e local. */
  kept: number;
  error: string | null;
  /**
   * Ids (externalId) de TODAS as vagas do board, filtradas, descartadas ou não
   * (o id vem do item cru). Vaga da empresa que não está aqui saiu do board:
   * encerrada. Ausente quando a lista não é confiável (item descartado sem id).
   */
  externalIds?: string[];
}

/** Lançado quando TODAS as empresas falham; leva o resultado de cada uma. */
export class AllCompaniesFailedError extends Error {
  constructor(
    message: string,
    readonly companies: CompanyScanStat[],
  ) {
    super(message);
    this.name = 'AllCompaniesFailedError';
  }
}

/** `query.companies` aceita slugs (`slug` ou `slug=Nome`) ou empresas prontas. */
export function resolveQueryCompanies(companies: SourceQuery['companies']): BoardCompany[] | null {
  if (!companies?.length) return null;
  return parseCompanyList(
    companies.map((item) =>
      typeof item === 'string' ? item : item.name ? `${item.slug}=${item.name}` : item.slug,
    ),
  );
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
  /** Id da vaga no item cru (o mesmo do `externalId`). Padrão: o campo `id`. */
  rawId?: (raw: unknown) => string | null;
}

/** `id` do item cru (texto ou número), sem depender do resto do formato. */
export function rawIdOf(raw: unknown): string | null {
  const id = raw && typeof raw === 'object' ? (raw as { id?: unknown }).id : undefined;
  if (typeof id === 'string') return id.trim() || null;
  if (typeof id === 'number' && Number.isFinite(id)) return String(id);
  return null;
}

/**
 * Ids de todas as vagas do board, das linhas cruas (assim uma mudança de
 * formato que descarta tudo não "encerra" as vagas da empresa). `undefined`
 * quando algum item descartado pode não ter id: aí não dá para saber quem saiu.
 */
function boardIds(
  rows: readonly unknown[],
  mapped: readonly BoardItem[],
  dropped: number,
  rawId: (raw: unknown) => string | null,
): string[] | undefined {
  const ids = new Set<string>();
  let withoutId = 0;
  for (const row of rows) {
    const id = rawId(row);
    if (id) ids.add(id);
    else withoutId += 1;
  }
  if (dropped > 0 && withoutId > 0) return undefined;
  for (const item of mapped) {
    if (item.posting.externalId) ids.add(item.posting.externalId);
  }
  return [...ids];
}

/**
 * O loop que as três fontes de board compartilham:
 *
 *  - empresas de `query.companies` (a API, que guarda a lista no banco, e o
 *    `try`) ou da configuração;
 *  - pausa entre empresas;
 *  - empresa com erro (404 = slug errado) vira aviso e as outras seguem;
 *    só lança se TODAS falharem (`AllCompaniesFailedError`, com o resultado
 *    de cada uma);
 *  - filtros de título e local, contados em `filtered`;
 *  - o resultado de cada empresa em `companies`;
 *  - a mesma URL entra uma vez.
 */
export async function scanCompanies(options: ScanCompaniesOptions): Promise<SourceResult> {
  const { sourceId, config, query, ctx } = options;
  const companies = resolveQueryCompanies(query.companies) ?? config.companies;
  const passes = query.skipFilters ? () => true : createBoardFilter(config.filters);

  const byUrl = new Map<string, JobPosting>();
  let dropped = 0;
  let filtered = 0;
  let failed = 0;
  let firstError: unknown = null;
  const stats: CompanyScanStat[] = [];

  if (companies.length === 0) {
    ctx.log(`${sourceId}: nenhuma empresa configurada`);
    return { jobs: [], dropped: 0, filtered: 0, companies: [] };
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
        item.posting.board = company.slug;
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
      const externalIds = boardIds(rows, result.ok, result.dropped, options.rawId ?? rawIdOf);
      stats.push({
        slug: company.slug,
        status: 'ok',
        jobs: rows.length,
        kept,
        error: null,
        ...(externalIds ? { externalIds } : {}),
      });
      ctx.log(
        `${sourceId}: ${company.slug} — ${rows.length} vagas, ${kept} mantidas, ` +
          `${result.ok.length - kept} filtradas, ${result.dropped} descartadas`,
      );
      if (!externalIds) {
        ctx.log(
          `${sourceId}: ${company.slug} — vagas descartadas sem id: não confere quais saíram do board`,
        );
      }
    } catch (error) {
      if (ctx.signal.aborted) {
        throw error;
      }
      failed += 1;
      firstError ??= error;
      const reason = error instanceof Error ? error.message : String(error);

      if (error instanceof HttpError && error.status === 404) {
        stats.push({ slug: company.slug, status: 'not_found', jobs: 0, kept: 0, error: reason });
        ctx.log(`${sourceId}: "${company.slug}" não encontrada (404) — confira o slug`);
      } else {
        stats.push({ slug: company.slug, status: 'failed', jobs: 0, kept: 0, error: reason });
        ctx.log(`${sourceId}: "${company.slug}" falhou (${reason}) — seguindo com as outras`);
      }
    }
  }

  if (failed === companies.length) {
    const message = firstError instanceof Error ? firstError.message : String(firstError);
    throw new AllCompaniesFailedError(message, stats);
  }

  return { jobs: [...byUrl.values()], dropped, filtered, companies: stats };
}

/** Nome exibido: o do `.env`, senão o da API, senão o derivado do slug. */
export function companyDisplayName(
  company: BoardCompany,
  fromApi: string | null | undefined,
  fromSlug: (slug: string) => string,
): string {
  return company.name ?? (fromApi?.trim() || fromSlug(company.slug));
}
