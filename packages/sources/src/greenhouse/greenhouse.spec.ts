import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCompanyList } from '../core/boards/companies';
import { HttpError, type HttpClient } from '../core/http';
import { parseEach } from '../core/parse-each';
import sample from './__fixtures__/board-sample.json';
import { parseGreenhouseConfig } from './greenhouse.config';
import { mapGreenhouseJob } from './greenhouse.mapper';
import { greenhouseBoardSchema, greenhouseJobSchema } from './greenhouse.schema';
import { GreenhouseSource, greenhouseUrl } from './greenhouse.source';
import { greenhouseSourceDefinition } from './index';

const acme = { slug: 'acme', name: null };

/* ---------------------------------------------------------------- mapper */

describe('mapGreenhouseJob', () => {
  it('converte uma vaga completa, com HTML escapado', () => {
    expect(mapGreenhouseJob(sample.jobs[0], acme)).toEqual({
      posting: {
        source: 'greenhouse',
        externalId: '4001',
        // gh_src é rastreamento: sai.
        url: 'https://job-boards.greenhouse.io/acme/jobs/4001',
        title: 'Software Engineer',
        company: 'Acme Pagamentos',
        description: 'Trabalhe com Node.js e React.\n\n• TypeScript\n• PostgreSQL & Redis',
        location: 'São Paulo, Brazil',
        workModel: null,
        contractType: null,
        seniority: null,
        stack: ['typescript', 'react', 'node.js', 'postgresql', 'redis'],
        salary: null,
        postedAt: '2026-10-01T13:00:00.000Z',
      },
      place: {
        entries: [{ text: 'São Paulo, Brazil' }, { text: 'São Paulo, São Paulo, Brazil' }],
      },
    });
  });

  it('link no site da empresa mantém o gh_jid; remota pelo texto do local', () => {
    expect(mapGreenhouseJob(sample.jobs[1], acme)?.posting).toMatchObject({
      url: 'https://www.acme.com/careers/job?gh_jid=4002',
      workModel: 'remote',
      seniority: 'senior',
      postedAt: null,
    });
  });

  it('nome da empresa: .env > API > slug', () => {
    expect(mapGreenhouseJob(sample.jobs[4], acme)?.posting.company).toBe('Acme');
    expect(
      mapGreenhouseJob(sample.jobs[0], { slug: 'acme', name: 'ACME S.A.' })?.posting.company,
    ).toBe('ACME S.A.');
  });

  it('sem título ou com link inválido → null', () => {
    const result = parseEach(sample.jobs, (raw) => mapGreenhouseJob(raw, acme));
    expect(result.ok).toHaveLength(5);
    expect(result.dropped).toBe(2);
  });
});

/* ---------------------------------------------------------------- fonte */

function fakeHttp(boards: Record<string, unknown | Error>) {
  const calls: string[] = [];
  const http: HttpClient = {
    getJson: async (url) => {
      calls.push(url);
      const slug = new URL(url).pathname.split('/')[3] ?? '';
      const board = boards[slug];
      if (board instanceof Error) throw board;
      if (board === undefined) throw new HttpError('HTTP 404', url, 404);
      return board;
    },
    getText: async () => '',
  };
  return { http, calls };
}

const ctx = (http: HttpClient, logs: string[] = []) => ({
  http,
  signal: new AbortController().signal,
  log: (line: string) => logs.push(line),
});

const config = {
  ...parseGreenhouseConfig({}),
  companies: parseCompanyList('acme'),
  requestDelayMs: 0,
};

describe('GreenhouseSource', () => {
  it('monta a URL do board com as descrições', () => {
    expect(greenhouseUrl('acme')).toBe(
      'https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true',
    );
  });

  it('filtra vendas e "Remote - US"; descarta itens inválidos', async () => {
    const { http } = fakeHttp({ acme: sample });
    const result = await new GreenhouseSource(config).fetch({}, ctx(http));

    expect(result.jobs.map((job) => job.externalId)).toEqual(['4001', '4002', '4005']);
    expect(result).toMatchObject({ filtered: 2, dropped: 2 });
  });

  it('resposta fora do formato conta como falha da empresa', async () => {
    const { http } = fakeHttp({ acme: { erro: 'mudou' } });
    await expect(new GreenhouseSource(config).fetch({}, ctx(http))).rejects.toThrow(
      'formato inesperado',
    );
  });

  it('slug inexistente avisa e as outras empresas seguem', async () => {
    const { http, calls } = fakeHttp({ acme: sample });
    const logs: string[] = [];
    const result = await new GreenhouseSource(config).fetch(
      { companies: ['nao-existe', 'acme'] },
      ctx(http, logs),
    );

    expect(calls).toHaveLength(2);
    expect(result.jobs).toHaveLength(3);
    expect(logs[0]).toContain('"nao-existe" não encontrada (404)');
  });
});

describe('definição', () => {
  it('lê GREENHOUSE_COMPANIES; sem empresas fica inativa', () => {
    const config = greenhouseSourceDefinition.parseConfig({ GREENHOUSE_COMPANIES: 'acme=Acme' });
    expect(config.companies).toEqual([{ slug: 'acme', name: 'Acme' }]);
    expect(greenhouseSourceDefinition.inactiveReason?.(config)).toBeNull();
    expect(
      greenhouseSourceDefinition.inactiveReason?.(greenhouseSourceDefinition.parseConfig({})),
    ).toMatch(/GREENHOUSE_COMPANIES/);
  });
});

/* ----------------------------------------------------- resposta real */

const LIVE_FIXTURE = join(__dirname, '__fixtures__', 'live-page.json');

/** Só roda depois de `try greenhouse <slug> --save-fixture`. */
describe.skipIf(!existsSync(LIVE_FIXTURE))('resposta real gravada (live-page.json)', () => {
  it('todo item bate com o schema e vira vaga', () => {
    const board = greenhouseBoardSchema.parse(JSON.parse(readFileSync(LIVE_FIXTURE, 'utf8')));
    expect(board.jobs.length).toBeGreaterThan(0);

    const invalid = board.jobs.filter((item) => !greenhouseJobSchema.safeParse(item).success);
    expect(invalid).toEqual([]);

    const result = parseEach(board.jobs, (raw) => mapGreenhouseJob(raw, acme));
    expect(result.ok.length).toBeGreaterThan(0);
  });
});
