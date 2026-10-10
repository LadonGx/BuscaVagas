import type { JobPosting } from '@busca-vagas/shared';
import { describe, expect, it } from 'vitest';
import { HttpError, type HttpClient } from '../http';
import type { SourceContext } from '../job-source';
import { companyNameFromSlug, parseCompanyList } from './companies';
import {
  createBoardFilter,
  DEFAULT_BOARD_FILTERS,
  parseBoardFilters,
  type BoardItem,
} from './filters';
import { noCompaniesReason, parseCompanyBoardConfig, scanCompanies } from './per-company';
import { classifyPlace } from './place';
import { createTitleMatcher } from './title-filter';

/* ------------------------------------------------------------ empresas */

describe('lista de empresas', () => {
  it('slug e slug=Nome, sem repetir', () => {
    expect(parseCompanyList(' acme , beta-pay=Beta Pagamentos S.A.,ACME,, ')).toEqual([
      { slug: 'acme', name: null },
      { slug: 'beta-pay', name: 'Beta Pagamentos S.A.' },
    ]);
  });

  it('slug inválido explica qual item', () => {
    expect(() => parseCompanyList('acme,https://jobs.lever.co/acme')).toThrow(
      /"https:\/\/jobs.lever.co\/acme" não é um slug válido/,
    );
  });

  it('nome a partir do slug', () => {
    expect(companyNameFromSlug('quinto-andar')).toBe('Quinto Andar');
    expect(companyNameFromSlug('acme_tech.io')).toBe('Acme Tech Io');
  });

  it('config por prefixo, com os filtros comuns', () => {
    const config = parseCompanyBoardConfig('LEVER_', {
      LEVER_COMPANIES: 'acme',
      LEVER_REQUEST_DELAY_MS: '0',
      BOARDS_LOCATION: 'br',
    });
    expect(config).toMatchObject({
      companies: [{ slug: 'acme', name: null }],
      requestDelayMs: 0,
      filters: { location: 'br' },
    });
    expect(() => parseCompanyBoardConfig('LEVER_', { LEVER_COMPANIES: 'a b' })).toThrow(
      /LEVER_COMPANIES/,
    );
  });

  it('sem empresas, a fonte fica inativa com o motivo', () => {
    const reason = noCompaniesReason('ASHBY_');
    expect(reason(parseCompanyBoardConfig('ASHBY_', {}))).toMatch(/ASHBY_COMPANIES vazio/);
    expect(reason(parseCompanyBoardConfig('ASHBY_', { ASHBY_COMPANIES: 'x' }))).toBeNull();
  });
});

/* -------------------------------------------------------------- título */

describe('filtro de título', () => {
  const isTech = createTitleMatcher();

  it.each([
    'Software Engineer II',
    'Senior Backend Engineer (Node.js)',
    'Pessoa Desenvolvedora Front-End Jr',
    'Desenvolvedor(a) Full-Stack',
    'Engenheiro(a) de Dados',
    'QA Analyst',
    'iOS Developer',
    'Tech Lead - Pagamentos',
    'Estágio em Engenharia de Software',
    'Engineering Manager',
    'SRE',
  ])('mantém "%s"', (title) => {
    expect(isTech(title)).toBe(true);
  });

  it.each([
    'Account Executive',
    'Sales Engineer',
    'Business Development Representative',
    'Technical Recruiter - Engineering',
    'Engenheiro Civil',
    'Analista Financeiro',
    'Product Designer',
    'Desenvolvedor de Negócios',
  ])('filtra "%s"', (title) => {
    expect(isTech(title)).toBe(false);
  });

  it('lista customizada substitui a padrão', () => {
    const onlyData = createTitleMatcher(['data scientist', 'cientista de dados'], []);
    expect(onlyData('Senior Data Scientist')).toBe(true);
    expect(onlyData('Software Engineer')).toBe(false);
  });

  it('não casa pedaço de palavra', () => {
    expect(isTech('Devolução e Logística')).toBe(false);
    expect(isTech('Qualidade (QA)')).toBe(true);
  });
});

/* --------------------------------------------------------------- local */

describe('classificação de local', () => {
  it.each([
    [{ entries: [{ text: 'São Paulo, Brazil' }] }, 'brazil'],
    [{ entries: [{ text: 'Campinas, SP' }] }, 'brazil'],
    [{ entries: [{ text: 'Remote', country: 'BR' }] }, 'brazil'],
    [{ entries: [{ text: 'Remote - Brazil' }] }, 'brazil'],
    [{ entries: [{ text: 'Remote' }] }, 'remote-open'],
    [{ entries: [{ text: 'Remoto (100%)' }] }, 'remote-open'],
    [{ entries: [{ text: 'Remote - LATAM' }] }, 'remote-open'],
    [{ entries: [{ text: 'Latin America' }] }, 'remote-open'],
    [{ entries: [{ text: 'Anywhere' }] }, 'remote-open'],
    [{ entries: [], remote: true }, 'remote-open'],
    [{ entries: [{ text: 'Remote - US' }] }, 'foreign'],
    [{ entries: [{ text: 'Remote', country: 'US' }] }, 'foreign'],
    [{ entries: [{ text: 'Remote - North America' }] }, 'foreign'],
    [{ entries: [{ text: 'London' }] }, 'foreign'],
    [{ entries: [{ text: 'Columbia, SC' }] }, 'foreign'],
    [{ entries: [{ text: 'New York' }], remote: true }, 'foreign'],
    [{ entries: [{ text: null }] }, 'unknown'],
    [{ entries: [] }, 'unknown'],
  ] as const)('%j → %s', (info, expected) => {
    expect(classifyPlace(info)).toBe(expected);
  });

  it('várias localizações: fica a melhor', () => {
    expect(
      classifyPlace({ entries: [{ text: 'New York' }, { text: 'São Paulo' }, { text: 'London' }] }),
    ).toBe('brazil');
  });
});

/* ------------------------------------------------------------- filtros */

function item(title: string, place: string | null): BoardItem {
  return {
    posting: { title, url: `https://example.com/${encodeURIComponent(title)}` } as JobPosting,
    place: { entries: [{ text: place }] },
  };
}

describe('filtros combinados', () => {
  it('padrão: tecnologia + Brasil/remota aberta/sem local', () => {
    const passes = createBoardFilter(DEFAULT_BOARD_FILTERS);
    expect(passes(item('Software Engineer', 'São Paulo'))).toBe(true);
    expect(passes(item('Software Engineer', 'Remote'))).toBe(true);
    expect(passes(item('Software Engineer', null))).toBe(true);
    expect(passes(item('Software Engineer', 'Berlin'))).toBe(false);
    expect(passes(item('Account Executive', 'São Paulo'))).toBe(false);
  });

  it('BOARDS_LOCATION=br tira as remotas abertas; any aceita tudo', () => {
    const br = createBoardFilter(parseBoardFilters({ BOARDS_LOCATION: 'br' }));
    expect(br(item('Developer', 'Remote'))).toBe(false);
    expect(br(item('Developer', 'Recife'))).toBe(true);

    const any = createBoardFilter(parseBoardFilters({ BOARDS_LOCATION: 'any' }));
    expect(any(item('Developer', 'Berlin'))).toBe(true);
  });

  it('palavras e exclusões do .env', () => {
    const filters = parseBoardFilters({
      BOARDS_TITLE_KEYWORDS: 'data scientist, analista de dados',
      BOARDS_TITLE_EXCLUDE: '',
    });
    expect(filters.titleKeywords).toEqual(['data scientist', 'analista de dados']);
    expect(filters.titleExclude).toEqual(DEFAULT_BOARD_FILTERS.titleExclude);
    expect(() => parseBoardFilters({ BOARDS_LOCATION: 'mars' })).toThrow(/BOARDS_LOCATION/);
  });
});

/* ------------------------------------------------------- loop por empresa */

function ctx(logs: string[] = []): SourceContext {
  const http: HttpClient = { getJson: async () => null, getText: async () => '' };
  return { http, signal: new AbortController().signal, log: (line) => logs.push(line) };
}

const config = parseCompanyBoardConfig('X_', {
  X_COMPANIES: 'acme,beta,gama',
  X_REQUEST_DELAY_MS: '0',
});

/** Itens crus: `{ title, place }`; `null` vira descartado. */
const mapItem = (raw: unknown) => {
  const row = raw as { title: string; place: string | null } | null;
  return row ? item(row.title, row.place) : null;
};

describe('scanCompanies', () => {
  it('junta as empresas, conta filtradas e descartadas, sem repetir URL', async () => {
    const boards: Record<string, unknown[]> = {
      acme: [
        { title: 'Backend Developer', place: 'Remote' },
        { title: 'Account Executive', place: 'São Paulo' },
        null,
      ],
      beta: [
        { title: 'Backend Developer', place: 'Remote' },
        { title: 'Frontend Engineer', place: 'Berlin' },
      ],
      gama: [{ title: 'Mobile Developer', place: 'Recife' }],
    };
    const logs: string[] = [];

    const result = await scanCompanies({
      sourceId: 'x',
      config,
      query: {},
      ctx: ctx(logs),
      fetchCompany: async (company) => boards[company.slug] ?? [],
      mapItem,
    });

    expect(result.jobs.map((job) => job.title)).toEqual(['Backend Developer', 'Mobile Developer']);
    expect(result).toMatchObject({ filtered: 2, dropped: 1 });
    expect(logs[0]).toBe('x: acme — 3 vagas, 1 mantidas, 1 filtradas, 1 descartadas');
  });

  it('empresa inexistente (404) é aviso; as outras seguem', async () => {
    const logs: string[] = [];
    const result = await scanCompanies({
      sourceId: 'x',
      config,
      query: {},
      ctx: ctx(logs),
      fetchCompany: async (company) => {
        if (company.slug === 'beta') throw new HttpError('HTTP 404', 'u', 404);
        return [{ title: `Developer ${company.slug}`, place: null }];
      },
      mapItem,
    });

    expect(result.jobs).toHaveLength(2);
    expect(logs).toContain('x: "beta" não encontrada (404) — confira o slug');
  });

  it('todas falhando lança', async () => {
    await expect(
      scanCompanies({
        sourceId: 'x',
        config,
        query: {},
        ctx: ctx(),
        fetchCompany: async () => {
          throw new HttpError('HTTP 503', 'u', 503);
        },
        mapItem,
      }),
    ).rejects.toThrow('HTTP 503');
  });

  it('empresas da query substituem as do .env; skipFilters desliga os filtros', async () => {
    const asked: string[] = [];
    const result = await scanCompanies({
      sourceId: 'x',
      config,
      query: { companies: ['outra'], skipFilters: true },
      ctx: ctx(),
      fetchCompany: async (company) => {
        asked.push(company.slug);
        return [{ title: 'Account Executive', place: 'Berlin' }];
      },
      mapItem,
    });

    expect(asked).toEqual(['outra']);
    expect(result).toMatchObject({ filtered: 0 });
    expect(result.jobs).toHaveLength(1);
  });

  it('sem empresas: vazio, sem requisição', async () => {
    const logs: string[] = [];
    const result = await scanCompanies({
      sourceId: 'x',
      config: { ...config, companies: [] },
      query: {},
      ctx: ctx(logs),
      fetchCompany: async () => {
        throw new Error('não devia buscar');
      },
      mapItem,
    });
    expect(result).toEqual({ jobs: [], dropped: 0, filtered: 0 });
    expect(logs).toEqual(['x: nenhuma empresa configurada']);
  });
});
