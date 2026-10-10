import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCompanyList } from '../core/boards/companies';
import { classifyPlace } from '../core/boards/place';
import { HttpError, type HttpClient } from '../core/http';
import { parseEach } from '../core/parse-each';
import sample from './__fixtures__/board-sample.json';
import { parseAshbyConfig } from './ashby.config';
import { ashbySalaryPeriod, ashbyWorkModel, mapAshbyJob } from './ashby.mapper';
import { ashbyBoardSchema, ashbyJobSchema } from './ashby.schema';
import { AshbySource, ashbyUrl } from './ashby.source';
import { ashbySourceDefinition } from './index';

const acme = { slug: 'acme', name: 'Acme Labs' };

describe('mapAshbyJob', () => {
  it('converte uma vaga completa, só com o salário (sem equity)', () => {
    expect(mapAshbyJob(sample.jobs[0], acme)).toEqual({
      posting: {
        source: 'ashby',
        externalId: 'a1',
        url: 'https://jobs.ashbyhq.com/acme/a1',
        title: 'Full Stack Engineer',
        company: 'Acme Labs',
        description: 'React, Node.js e AWS.',
        location: 'Remote - Brazil',
        workModel: 'remote',
        contractType: null,
        seniority: null,
        stack: ['react', 'node.js', 'aws'],
        salary: { min: 40000, max: 60000, currency: 'USD', period: 'year' },
        postedAt: '2026-10-02T12:00:00.000Z',
      },
      place: { entries: [{ text: 'Remote - Brazil', country: 'Brazil' }], remote: true },
    });
  });

  it('local secundário "Remote - LATAM" salva a vaga de Nova York', () => {
    const item = mapAshbyJob(sample.jobs[1], acme);
    expect(item?.posting.workModel).toBe('hybrid');
    expect(classifyPlace(item!.place)).toBe('remote-open');
  });

  it('remota com endereço nos EUA é estrangeira', () => {
    expect(classifyPlace(mapAshbyJob(sample.jobs[2], acme)!.place)).toBe('foreign');
  });

  it('estágio presencial', () => {
    expect(mapAshbyJob(sample.jobs[3], acme)?.posting).toMatchObject({
      contractType: 'internship',
      seniority: 'intern',
      workModel: 'onsite',
    });
  });

  it('não listada → null', () => {
    expect(mapAshbyJob(sample.jobs[4], acme)).toBeNull();
  });

  it('helpers', () => {
    expect(ashbyWorkModel('OnSite')).toBe('onsite');
    expect(ashbyWorkModel(null)).toBeNull();
    expect(ashbySalaryPeriod('1 MONTH')).toBe('month');
    expect(ashbySalaryPeriod('NONE')).toBeNull();
  });
});

describe('AshbySource', () => {
  const config = {
    ...parseAshbyConfig({}),
    companies: parseCompanyList('acme'),
    requestDelayMs: 0,
  };
  const http: HttpClient = {
    getJson: async (url) => {
      if (!url.includes('/acme?')) throw new HttpError('HTTP 404', url, 404);
      return sample;
    },
    getText: async () => '',
  };
  const ctx = { http, signal: new AbortController().signal, log: () => {} };

  it('monta a URL com a remuneração', () => {
    expect(ashbyUrl('acme')).toBe(
      'https://api.ashbyhq.com/posting-api/job-board/acme?includeCompensation=true',
    );
  });

  it('filtra EUA e marketing; descarta não listada', async () => {
    const result = await new AshbySource(config).fetch({}, ctx);
    expect(result.jobs.map((job) => job.externalId)).toEqual(['a1', 'a2', 'a4']);
    expect(result).toMatchObject({ filtered: 2, dropped: 1 });
  });

  it('definição: ASHBY_COMPANIES vazio = inativa', () => {
    expect(ashbySourceDefinition.inactiveReason?.(ashbySourceDefinition.parseConfig({}))).toMatch(
      /ASHBY_COMPANIES/,
    );
  });
});

const LIVE_FIXTURE = join(__dirname, '__fixtures__', 'live-page.json');

/** Só roda depois de `try ashby <slug> --save-fixture`. */
describe.skipIf(!existsSync(LIVE_FIXTURE))('resposta real gravada (live-page.json)', () => {
  it('todo item bate com o schema e vira vaga', () => {
    const board = ashbyBoardSchema.parse(JSON.parse(readFileSync(LIVE_FIXTURE, 'utf8')));
    expect(board.jobs.length).toBeGreaterThan(0);
    expect(board.jobs.filter((item) => !ashbyJobSchema.safeParse(item).success)).toEqual([]);
    expect(parseEach(board.jobs, (raw) => mapAshbyJob(raw, acme)).ok.length).toBeGreaterThan(0);
  });
});
