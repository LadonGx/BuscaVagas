import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HttpError, type HttpClient } from '../core/http';
import { parseEach } from '../core/parse-each';
import sample from './__fixtures__/page-sample.json';
import { parseGupyConfig } from './gupy.config';
import {
  gupyVacancyKind,
  gupyWorkModel,
  isConfidentialGupyJob,
  isGupyUrl,
  mapGupyJob,
} from './gupy.mapper';
import { gupyJobSchema, gupyPageSchema } from './gupy.schema';
import { GUPY_PAGE_SIZE, GupySource, gupyUrl } from './gupy.source';

/* ---------------------------------------------------------------- mapper */

describe('mapGupyJob', () => {
  it('converte uma vaga completa', () => {
    expect(mapGupyJob(sample.data[0])).toEqual({
      source: 'gupy',
      externalId: '8765432',
      // jobBoardSource é rastreamento: sai na URL canônica.
      url: 'https://acme.gupy.io/job/eyJqb2JJZCI6ODc2NTQzMn0=',
      title: 'Desenvolvedor(a) Full Stack Júnior',
      company: 'Acme Tecnologia',
      description:
        'Buscamos pessoa desenvolvedora para atuar com Node.js, React e PostgreSQL.\n\n• TypeScript\n• Docker',
      location: 'Campinas, SP',
      workModel: 'hybrid',
      contractType: 'clt',
      seniority: 'junior',
      stack: ['typescript', 'react', 'node.js', 'postgresql', 'docker'],
      salary: null,
      postedAt: '2026-10-05T13:22:10.000Z',
    });
  });

  it('PJ, remoto pelo booleano e localização pelo país', () => {
    expect(mapGupyJob(sample.data[1])).toMatchObject({
      contractType: 'pj',
      workModel: 'remote',
      location: 'Brasil',
      seniority: 'mid',
      stack: ['java', 'spring', 'kafka'],
    });
  });

  it('estágio: contrato e nível vêm do tipo da vaga', () => {
    expect(mapGupyJob(sample.data[2])).toMatchObject({
      contractType: 'internship',
      seniority: 'intern',
      workModel: 'onsite',
      description: null,
      location: 'Americana, SP',
    });
  });

  it('formato do endpoint novo: link em `url`, sem país', () => {
    expect(mapGupyJob(sample.data[8])).toMatchObject({
      externalId: '8765440',
      url: 'https://omega.gupy.io/job/eyJqb2JJZCI6ODc2NTQ0MH0=',
      company: 'Omega Varejo',
      workModel: 'remote',
      contractType: 'clt',
      seniority: 'senior',
      location: 'São Paulo, São Paulo',
    });
  });

  it('descarta banco de talentos, confidencial, link fora da Gupy e sem título', () => {
    const result = parseEach(sample.data, mapGupyJob);
    expect(result.ok.map((job) => job.externalId)).toEqual([
      '8765432',
      '8765433',
      '8765434',
      '8765440',
    ]);
    expect(result.dropped).toBe(5);
  });

  it('item fora do formato vira null em vez de lançar', () => {
    expect(mapGupyJob({ name: 42 })).toBeNull();
    expect(mapGupyJob(null)).toBeNull();
  });
});

describe('helpers da Gupy', () => {
  it('só aceita https em *.gupy.io', () => {
    expect(isGupyUrl('https://acme.gupy.io/job/1')).toBe(true);
    expect(isGupyUrl('https://gupy.io/job/1')).toBe(true);
    expect(isGupyUrl('http://acme.gupy.io/job/1')).toBe(false);
    expect(isGupyUrl('https://notgupy.io/job/1')).toBe(false);
    expect(isGupyUrl('https://gupy.io.evil.com/job/1')).toBe(false);
  });

  it.each([
    ['vacancy_type_effective', { contract: 'clt', seniority: null }],
    ['vacancy_legal_entity', { contract: 'pj', seniority: null }],
    ['vacancy_type_internship', { contract: 'internship', seniority: 'intern' }],
    ['vacancy_type_temporary', { contract: 'temporary', seniority: null }],
    ['vacancy_type_trainee', { contract: 'other', seniority: 'trainee' }],
    ['vacancy_type_apprentice', { contract: 'other', seniority: 'intern' }],
    ['vacancy_type_freelancer', { contract: 'other', seniority: null }],
    ['vacancy_type_associate', { contract: 'other', seniority: null }],
    ['vacancy_type_talent_pool', 'talent-pool'],
    ['algo_novo', { contract: null, seniority: null }],
    [null, { contract: null, seniority: null }],
  ] as const)('tipo %s', (type, expected) => {
    expect(gupyVacancyKind(type)).toEqual(expected);
  });

  it('empresa confidencial pelas pistas que sobraram', () => {
    const base = { careerPageName: 'Acme', jobUrl: 'https://acme.gupy.io/job/1' };
    expect(isConfidentialGupyJob(base)).toBe(false);
    expect(isConfidentialGupyJob({ ...base, isConfidentialCareerPage: true })).toBe(true);
    expect(isConfidentialGupyJob({ ...base, careerPageName: ' CONFIDENCIAL ' })).toBe(true);
    expect(
      isConfidentialGupyJob({
        ...base,
        careerPageLogo: 'https://static.gupy.io/images/confidencial_logo.png',
      }),
    ).toBe(true);
    expect(
      isConfidentialGupyJob({ ...base, jobUrl: 'https://confidencialidade.gupy.io/job/1' }),
    ).toBe(true);
  });

  it('modalidade', () => {
    expect(gupyWorkModel({ workplaceType: 'on-site' })).toBe('onsite');
    expect(gupyWorkModel({ workplaceType: '', isRemoteWork: true })).toBe('remote');
    expect(gupyWorkModel({ workplaceType: null, isRemoteWork: false })).toBeNull();
  });
});

describe('configuração', () => {
  it('padrões e leitura do .env com prefixo', () => {
    expect(parseGupyConfig({})).toEqual({ maxPages: 3, requestDelayMs: 300 });
    expect(parseGupyConfig({ GUPY_MAX_PAGES: '5', GUPY_REQUEST_DELAY_MS: '0' })).toEqual({
      maxPages: 5,
      requestDelayMs: 0,
    });
  });

  it('valor inválido explica qual variável', () => {
    expect(() => parseGupyConfig({ GUPY_MAX_PAGES: '0' })).toThrow(/GUPY_MAX_PAGES/);
  });
});

/* ---------------------------------------------------------------- fonte */

function gupyRow(n: number) {
  return {
    id: n,
    name: `Desenvolvedor ${n}`,
    jobUrl: `https://acme.gupy.io/job/${n}`,
    careerPageName: 'Acme',
    type: 'vacancy_type_effective',
  };
}

/** Responde por termo e offset; registra as URLs pedidas. */
function fakeGupy(pages: Record<string, unknown[][] | Error>) {
  const calls: string[] = [];
  const http: HttpClient = {
    getJson: async (url) => {
      calls.push(url);
      const params = new URL(url).searchParams;
      const term = params.get('jobName') ?? '';
      const page = Number(params.get('offset')) / GUPY_PAGE_SIZE;
      const byTerm = pages[term];
      if (byTerm instanceof Error) throw byTerm;
      return { data: byTerm?.[page] ?? [] };
    },
    getText: async () => '',
  };
  return { http, calls };
}

const ctx = (http: HttpClient, logs: string[] = []) => ({
  http,
  signal: new AbortController().signal,
  log: (message: string) => logs.push(message),
});

const fullPage = (start: number) =>
  Array.from({ length: GUPY_PAGE_SIZE }, (_, i) => gupyRow(start + i));

describe('GupySource', () => {
  const noDelay = { maxPages: 3, requestDelayMs: 0 };

  it('monta a URL da busca', () => {
    expect(gupyUrl('full stack', 1)).toBe(
      'https://portal.gupy.io/api/job-search/jobs?jobName=full+stack&offset=100&limit=100',
    );
  });

  it('pagina até uma página incompleta', async () => {
    const { http, calls } = fakeGupy({ dev: [fullPage(0), [gupyRow(500), gupyRow(501)]] });

    const result = await new GupySource(noDelay).fetch({ terms: ['dev'] }, ctx(http));

    expect(calls).toHaveLength(2);
    expect(result.jobs).toHaveLength(GUPY_PAGE_SIZE + 2);
  });

  it('respeita o teto de páginas', async () => {
    const { http, calls } = fakeGupy({ dev: [fullPage(0), fullPage(100), fullPage(200)] });

    await new GupySource({ maxPages: 2, requestDelayMs: 0 }).fetch({ terms: ['dev'] }, ctx(http));

    expect(calls).toHaveLength(2);
  });

  it('uma busca por termo, sem repetir a vaga achada por dois termos', async () => {
    const { http, calls } = fakeGupy({
      node: [[gupyRow(1), gupyRow(2)]],
      react: [[gupyRow(2), gupyRow(3)]],
    });

    const result = await new GupySource(noDelay).fetch({ terms: ['node', 'react'] }, ctx(http));

    expect(calls.map((url) => new URL(url).searchParams.get('jobName'))).toEqual(['node', 'react']);
    expect(result.jobs.map((job) => job.externalId)).toEqual(['1', '2', '3']);
  });

  it('conta os descartados', async () => {
    const { http } = fakeGupy({ dev: [sample.data] });
    const result = await new GupySource(noDelay).fetch({ terms: ['dev'] }, ctx(http));
    expect(result).toMatchObject({ dropped: 5 });
    expect(result.jobs).toHaveLength(4);
  });

  it('resposta fora do formato encerra o termo sem lançar', async () => {
    const http: HttpClient = { getJson: async () => ({ erro: 'mudou' }), getText: async () => '' };
    const logs: string[] = [];

    const result = await new GupySource(noDelay).fetch({ terms: ['dev'] }, ctx(http, logs));

    expect(result).toEqual({ jobs: [], dropped: 0 });
    expect(logs[0]).toContain('formato inesperado');
  });

  it('um termo que falha não derruba os outros', async () => {
    const { http } = fakeGupy({
      node: new HttpError('HTTP 500', 'x', 500),
      react: [[gupyRow(7)]],
    });
    const logs: string[] = [];

    const result = await new GupySource(noDelay).fetch(
      { terms: ['node', 'react'] },
      ctx(http, logs),
    );

    expect(result.jobs).toHaveLength(1);
    expect(logs.some((line) => line.includes('"node" falhou'))).toBe(true);
  });

  it('todos os termos falhando lança (a execução fica como falha)', async () => {
    const { http } = fakeGupy({ node: new HttpError('HTTP 503', 'x', 503) });

    await expect(new GupySource(noDelay).fetch({ terms: ['node'] }, ctx(http))).rejects.toThrow(
      'HTTP 503',
    );
  });

  it('sem termos, usa "desenvolvedor"', async () => {
    const { http, calls } = fakeGupy({});
    await new GupySource(noDelay).fetch({}, ctx(http));
    expect(new URL(calls[0]!).searchParams.get('jobName')).toBe('desenvolvedor');
  });
});

/* ----------------------------------------------------- resposta real */

const LIVE_FIXTURE = join(__dirname, '__fixtures__', 'live-page.json');

/**
 * Só roda depois de `pnpm --filter @busca-vagas/sources try gupy <termo> --save-fixture`.
 * Garante que o mapper continua entendendo uma resposta REAL da Gupy.
 */
describe.skipIf(!existsSync(LIVE_FIXTURE))('resposta real gravada (live-page.json)', () => {
  it('todo item bate com o schema e há vagas aproveitadas', () => {
    const page = gupyPageSchema.parse(JSON.parse(readFileSync(LIVE_FIXTURE, 'utf8')));
    expect(page.data.length).toBeGreaterThan(0);

    // Item fora do schema = a Gupy mudou o formato. Descarte por regra
    // (banco de talentos, confidencial) é esperado e não conta aqui.
    const invalid = page.data.filter((item) => !gupyJobSchema.safeParse(item).success);
    expect(invalid).toEqual([]);

    const result = parseEach(page.data, mapGupyJob);
    expect(result.ok.length).toBeGreaterThan(0);
    for (const job of result.ok) {
      expect(isGupyUrl(job.url)).toBe(true);
    }
  });
});
