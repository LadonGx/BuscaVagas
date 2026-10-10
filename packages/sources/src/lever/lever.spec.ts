import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCompanyList } from '../core/boards/companies';
import { HttpError, type HttpClient } from '../core/http';
import { parseEach } from '../core/parse-each';
import sample from './__fixtures__/postings-sample.json';
import { leverSourceDefinition } from './index';
import { parseLeverConfig } from './lever.config';
import { leverSalaryPeriod, leverWorkModel, mapLeverPosting } from './lever.mapper';
import { leverPostingSchema, leverPostingsSchema } from './lever.schema';
import { LeverSource, leverUrl } from './lever.source';

const acme = { slug: 'acme-tech', name: null };

describe('mapLeverPosting', () => {
  it('converte uma vaga completa: listas, salário e todos os locais', () => {
    expect(mapLeverPosting(sample[0], acme)).toEqual({
      posting: {
        source: 'lever',
        externalId: '5b1c0001-0000-4000-8000-000000000001',
        url: 'https://jobs.lever.co/acme/5b1c0001-0000-4000-8000-000000000001',
        title: 'Desenvolvedor(a) Backend Pleno',
        // O Lever não dá o nome: vem do slug.
        company: 'Acme Tech',
        description:
          'Atuar com Node.js e PostgreSQL.\nRequisitos\n\n• TypeScript\n• Docker\nVR e plano de saúde.',
        location: 'São Paulo',
        workModel: 'hybrid',
        contractType: 'clt',
        seniority: 'mid',
        stack: ['typescript', 'node.js', 'postgresql', 'docker'],
        salary: { min: 8000, max: 12000, currency: 'BRL', period: 'month' },
        postedAt: new Date(1791000000000).toISOString(),
      },
      place: {
        entries: [
          { text: 'São Paulo', country: 'BR' },
          { text: 'Remote', country: 'BR' },
        ],
        remote: false,
      },
    });
  });

  it('estágio remoto: nível pelo contrato, descrição em texto puro', () => {
    expect(mapLeverPosting(sample[1], acme)?.posting).toMatchObject({
      url: 'https://jobs.lever.co/acme/5b1c0002-0000-4000-8000-000000000002',
      contractType: 'internship',
      seniority: 'intern',
      workModel: 'remote',
      description: 'Python e SQL.',
      salary: null,
    });
  });

  it('full-time não vira CLT', () => {
    expect(mapLeverPosting(sample[2], acme)?.posting.contractType).toBeNull();
  });

  it('item fora do formato → null', () => {
    const result = parseEach(sample, (raw) => mapLeverPosting(raw, acme));
    expect(result).toMatchObject({ dropped: 1 });
    expect(result.ok).toHaveLength(4);
  });

  it('helpers', () => {
    expect(leverWorkModel('on-site')).toBe('onsite');
    expect(leverWorkModel('unspecified')).toBeNull();
    expect(leverSalaryPeriod('per-year-salary')).toBe('year');
    expect(leverSalaryPeriod('per-hour-wage')).toBe('hour');
    expect(leverSalaryPeriod('one-time')).toBeNull();
  });
});

function fakeHttp(boards: Record<string, unknown>) {
  const http: HttpClient = {
    getJson: async (url) => {
      const slug = new URL(url).pathname.split('/')[3] ?? '';
      if (!(slug in boards)) throw new HttpError('HTTP 404', url, 404);
      return boards[slug];
    },
    getText: async () => '',
  };
  return http;
}

const ctx = (http: HttpClient) => ({
  http,
  signal: new AbortController().signal,
  log: () => {},
});

describe('LeverSource', () => {
  const config = {
    ...parseLeverConfig({}),
    companies: parseCompanyList('acme'),
    requestDelayMs: 0,
  };

  it('monta a URL', () => {
    expect(leverUrl('acme')).toBe('https://api.lever.co/v0/postings/acme?mode=json');
  });

  it('mantém Brasil e remota aberta; filtra US e vaga fora de tecnologia', async () => {
    const result = await new LeverSource(config).fetch({}, ctx(fakeHttp({ acme: sample })));
    expect(result.jobs.map((job) => job.title)).toEqual([
      'Desenvolvedor(a) Backend Pleno',
      'Software Engineer Intern',
    ]);
    expect(result).toMatchObject({ filtered: 2, dropped: 1 });
  });

  it('definição: LEVER_COMPANIES vazio = inativa', () => {
    expect(leverSourceDefinition.inactiveReason?.(leverSourceDefinition.parseConfig({}))).toMatch(
      /LEVER_COMPANIES/,
    );
  });
});

const LIVE_FIXTURE = join(__dirname, '__fixtures__', 'live-page.json');

/** Só roda depois de `try lever <slug> --save-fixture`. */
describe.skipIf(!existsSync(LIVE_FIXTURE))('resposta real gravada (live-page.json)', () => {
  it('todo item bate com o schema e vira vaga', () => {
    const postings = leverPostingsSchema.parse(JSON.parse(readFileSync(LIVE_FIXTURE, 'utf8')));
    expect(postings.length).toBeGreaterThan(0);
    expect(postings.filter((item) => !leverPostingSchema.safeParse(item).success)).toEqual([]);
    expect(parseEach(postings, (raw) => mapLeverPosting(raw, acme)).ok.length).toBeGreaterThan(0);
  });
});
