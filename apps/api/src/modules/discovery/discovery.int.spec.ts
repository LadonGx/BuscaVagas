import type {
  JobPosting,
  Page,
  ScanResultDto,
  SourceInfoDto,
  SourceRunDto,
} from '@busca-vagas/shared';
import type { HttpClient, JobSource, SourceQuery } from '@busca-vagas/sources';
import { getQueueToken } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createTestApp, describeDb, resetDatabase, type TestApp } from '../../../test/helpers';
import { QUEUES } from '../../queue/queue.constants';
import { JobsModule } from '../jobs/jobs.module';
import { TrackedCompaniesStore } from './companies/tracked-companies.store';
import {
  NO_COMPANIES_REASON,
  SOURCE_HTTP_CLIENT,
  SOURCES,
  UNAVAILABLE_SOURCES,
} from './discovery.constants';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';
import { ScanRunner, SourceRunFailedError } from './scan-runner.service';

/* ---------------------------------------------------- fontes e fila falsas */

const posting = (n: number, source = 'fake'): JobPosting => ({
  source,
  externalId: String(n),
  url: `https://jobs.example.com/${source}/${n}`,
  title: `Vaga ${n}`,
  company: 'Acme',
  description: null,
  location: null,
  workModel: 'remote',
  contractType: 'clt',
  seniority: 'junior',
  stack: ['node.js'],
  salary: null,
  postedAt: null,
});

/** Fonte controlável pelo teste: o que devolver e quais termos recebeu. */
const fake = {
  jobs: [] as JobPosting[],
  dropped: 0,
  error: null as Error | null,
  queries: [] as SourceQuery[],
};

const fakeSource: JobSource = {
  id: 'fake',
  displayName: 'Fonte falsa',
  kind: 'search',
  fetch: async (query) => {
    fake.queries.push(query);
    if (fake.error) throw fake.error;
    return { jobs: fake.jobs, dropped: fake.dropped };
  },
};

/** Board de empresa falso: não usa termos e devolve vagas filtradas e o resultado por empresa. */
const boardQueries: SourceQuery[] = [];
const boardSource: JobSource = {
  id: 'board',
  displayName: 'Board falso',
  kind: 'company-board',
  fetch: async (query) => {
    boardQueries.push(query);
    return {
      jobs: [{ ...posting(10, 'board'), board: 'acme' }],
      dropped: 1,
      filtered: 5,
      companies: [
        { slug: 'acme', status: 'ok', jobs: 7, kept: 1, error: null, externalIds: ['10', '11'] },
        { slug: 'sumiu', status: 'not_found', jobs: 0, kept: 0, error: 'HTTP 404' },
      ],
    };
  },
};

const queue = {
  add: vi.fn(async (_name: string, data: { sourceId: string }) => ({ id: `job-${data.sourceId}` })),
  getDeduplicationJobId: vi.fn(async (_id: string): Promise<string | null> => null),
  getJobSchedulers: vi.fn(async (): Promise<{ key: string; next?: number }[]> => []),
  getJobs: vi.fn(async (): Promise<{ data: { sourceId: string } }[]> => []),
};

const http: HttpClient = { getJson: async () => ({}), getText: async () => '' };

/** O módulo de descoberta sem Redis: fila falsa, sem processor nem agenda. */
@Module({
  imports: [JobsModule],
  controllers: [DiscoveryController],
  providers: [
    ScanRunner,
    DiscoveryService,
    TrackedCompaniesStore,
    { provide: SOURCES, useValue: [fakeSource, boardSource] },
    {
      provide: UNAVAILABLE_SOURCES,
      useValue: [
        {
          id: 'parado',
          displayName: 'Board sem empresas',
          kind: 'company-board',
          reason: 'PARADO_COMPANIES vazio — nenhuma empresa para buscar',
        },
      ],
    },
    { provide: SOURCE_HTTP_CLIENT, useValue: http },
    { provide: getQueueToken(QUEUES.SOURCE_SCAN), useValue: queue },
  ],
})
class DiscoveryTestModule {}

describeDb('Descoberta (integração)', () => {
  let t: TestApp;
  let runner: ScanRunner;

  beforeAll(async () => {
    t = await createTestApp([DiscoveryTestModule]);
    runner = t.app.get(ScanRunner);
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    Object.assign(fake, { jobs: [], dropped: 0, error: null, queries: [] });
    boardQueries.length = 0;
    queue.add.mockClear();
    queue.getDeduplicationJobId.mockReset().mockResolvedValue(null);
    queue.getJobSchedulers.mockReset().mockResolvedValue([]);
    queue.getJobs.mockReset().mockResolvedValue([]);
  });

  const api = () => request(t.http);

  /** O board falso só busca com empresas ligadas no banco. */
  const track = (...slugs: string[]) =>
    t.prisma.trackedCompany.createMany({
      data: slugs.map((slug) => ({ source: 'board', slug })),
    });

  it('ScanRunner grava as vagas e o histórico com novas vs. já vistas', async () => {
    fake.jobs = [posting(1), posting(2)];
    fake.dropped = 3;

    const first = (await runner.run('fake', ['node', 'react'], 'manual'))!;
    expect(first).toMatchObject({
      sourceId: 'fake',
      status: 'ok',
      trigger: 'manual',
      terms: ['node', 'react'],
      jobsFound: 2,
      jobsNew: 2,
      dropped: 3,
      error: null,
    });
    expect(fake.queries[0]).toEqual({ terms: ['node', 'react'] });

    fake.jobs = [posting(2), posting(3)];
    const second = await runner.run('fake', ['node'], 'schedule');
    expect(second).toMatchObject({ jobsFound: 2, jobsNew: 1, trigger: 'schedule' });

    expect(await t.prisma.job.count()).toBe(3);
    expect(await t.prisma.sourceRun.count()).toBe(2);
    expect(first.filtered).toBe(0);
  });

  it('board de empresa: busca as empresas ligadas, grava as filtradas e não registra termos', async () => {
    await track('acme', 'sumiu');
    await t.prisma.trackedCompany.create({
      data: { source: 'board', slug: 'desligada', active: false },
    });
    const run = (await runner.run('board', ['node'], 'schedule'))!;

    expect(run).toMatchObject({ terms: [], jobsFound: 1, jobsNew: 1, dropped: 1, filtered: 5 });
    expect(boardQueries[0]).toEqual({
      terms: [],
      companies: [
        { slug: 'acme', name: null },
        { slug: 'sumiu', name: null },
      ],
    });

    // O resultado de cada empresa fica guardado para a tela.
    const stats = await t.prisma.trackedCompany.findMany({ orderBy: { slug: 'asc' } });
    expect(
      stats.map(({ slug, lastStatus, lastJobs, lastMatched }) => ({
        slug,
        lastStatus,
        lastJobs,
        lastMatched,
      })),
    ).toEqual([
      { slug: 'acme', lastStatus: 'ok', lastJobs: 7, lastMatched: 1 },
      { slug: 'desligada', lastStatus: null, lastJobs: null, lastMatched: null },
      { slug: 'sumiu', lastStatus: 'not_found', lastJobs: 0, lastMatched: 0 },
    ]);

    const [listed] = (
      (await api().get('/api/discovery/runs?sourceId=board').expect(200)).body as Page<SourceRunDto>
    ).items;
    expect(listed).toMatchObject({ id: run.id, filtered: 5 });
  });

  it('board de empresa: vaga que saiu do board da empresa fica encerrada', async () => {
    await track('acme', 'sumiu');
    const old = (id: string, board: string) => ({
      source: 'board',
      externalId: id,
      board,
      title: `Antiga ${id}`,
      company: 'Acme',
      url: `https://jobs.example.com/board/${id}`,
    });
    await t.prisma.job.createMany({
      data: [old('11', 'acme'), old('12', 'acme'), old('13', 'sumiu')],
    });

    await runner.run('board', [], 'schedule');

    const closed = await t.prisma.job.findMany({
      where: { source: 'board' },
      orderBy: { externalId: 'asc' },
      select: { externalId: true, closedReason: true },
    });
    expect(closed).toEqual([
      { externalId: '10', closedReason: null },
      { externalId: '11', closedReason: null }, // ainda listada no board
      { externalId: '12', closedReason: 'Saiu do board da empresa' },
      { externalId: '13', closedReason: null }, // empresa não lida: não mexe
    ]);
  });

  it('board sem empresas ligadas: não busca nem registra execução', async () => {
    await t.prisma.trackedCompany.create({ data: { source: 'board', slug: 'x', active: false } });

    expect(await runner.run('board', [], 'schedule')).toBeNull();
    expect(boardQueries).toEqual([]);
    expect(await t.prisma.sourceRun.count()).toBe(0);
  });

  it('falha da fonte fica registrada e é relançada (para o BullMQ tentar de novo)', async () => {
    fake.error = new Error('HTTP 503');

    const error = await runner.run('fake', ['node'], 'manual').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SourceRunFailedError);
    const run = (error as SourceRunFailedError).run;
    expect(run).toMatchObject({ status: 'failed', error: 'HTTP 503', jobsFound: 0 });
    expect(run.finishedAt).not.toBeNull();
    expect(await t.prisma.job.count()).toBe(0);
  });

  it('fonte que não está ativa é erro de programação', async () => {
    await expect(runner.run('linkedin', [], 'manual')).rejects.toThrow('não está ativa');
  });

  it('GET /discovery/sources traz a última execução de cada fonte', async () => {
    await track('acme', 'beta');
    let sources = (await api().get('/api/discovery/sources').expect(200)).body as SourceInfoDto[];
    expect(sources).toEqual([
      {
        id: 'fake',
        displayName: 'Fonte falsa',
        kind: 'search',
        active: true,
        reason: null,
        trackedCompanies: null,
        lastRun: null,
        nextRunAt: null,
        running: false,
      },
      {
        id: 'board',
        displayName: 'Board falso',
        kind: 'company-board',
        active: true,
        reason: null,
        trackedCompanies: 2,
        lastRun: null,
        nextRunAt: null,
        running: false,
      },
      {
        id: 'parado',
        displayName: 'Board sem empresas',
        kind: 'company-board',
        active: false,
        reason: 'PARADO_COMPANIES vazio — nenhuma empresa para buscar',
        trackedCompanies: null,
        lastRun: null,
        nextRunAt: null,
        running: false,
      },
    ]);

    fake.jobs = [posting(1)];
    await runner.run('fake', ['a'], 'manual');
    await runner.run('fake', ['b'], 'manual');

    sources = (await api().get('/api/discovery/sources').expect(200)).body;
    expect(sources[0]?.lastRun?.terms).toEqual(['b']);
  });

  it('GET /discovery/sources: board sem empresas ligadas aparece parado, com o caminho', async () => {
    const next = Date.parse('2026-10-11T18:00:00.000Z');
    queue.getJobSchedulers.mockResolvedValue([{ key: 'schedule:board', next }]);

    const sources = (await api().get('/api/discovery/sources').expect(200)).body as SourceInfoDto[];
    expect(sources.find((source) => source.id === 'board')).toMatchObject({
      active: false,
      reason: NO_COMPANIES_REASON,
      trackedCompanies: 0,
      nextRunAt: null,
    });
  });

  it('GET /discovery/sources traz a próxima busca agendada e o que está rodando', async () => {
    await track('acme');
    const next = Date.parse('2026-10-11T18:00:00.000Z');
    queue.getJobSchedulers.mockResolvedValue([
      { key: 'schedule:fake', next },
      { key: 'schedule:outra-coisa', next: next + 1 },
    ]);
    queue.getJobs.mockResolvedValue([{ data: { sourceId: 'board' } }]);

    const sources = (await api().get('/api/discovery/sources').expect(200)).body as SourceInfoDto[];
    expect(sources.map(({ id, nextRunAt, running }) => ({ id, nextRunAt, running }))).toEqual([
      { id: 'fake', nextRunAt: '2026-10-11T18:00:00.000Z', running: false },
      { id: 'board', nextRunAt: null, running: true },
      { id: 'parado', nextRunAt: null, running: false },
    ]);
    expect(queue.getJobs).toHaveBeenCalledWith(['waiting', 'active', 'prioritized']);
  });

  it('GET /discovery/sources responde mesmo com a fila fora do ar', async () => {
    queue.getJobSchedulers.mockRejectedValue(new Error('Connection is closed.'));
    const sources = (await api().get('/api/discovery/sources').expect(200)).body as SourceInfoDto[];
    expect(sources.every((source) => source.nextRunAt === null && !source.running)).toBe(true);
  });

  it('GET /discovery/sources não espera uma fila que não responde', async () => {
    queue.getJobSchedulers.mockReturnValue(new Promise(() => {}));
    const started = Date.now();
    const sources = (await api().get('/api/discovery/sources').expect(200)).body as SourceInfoDto[];
    expect(Date.now() - started).toBeLessThan(4_000);
    expect(sources[0]?.running).toBe(false);
  });

  it('POST /discovery/scan enfileira com os termos do .env ou os pedidos', async () => {
    await track('acme');
    const byEnv = (
      await api().post('/api/discovery/scan').set('Content-Type', 'application/json').expect(202)
    ).body as ScanResultDto;
    expect(byEnv.queued).toEqual([
      { sourceId: 'fake', jobId: 'job-fake' },
      { sourceId: 'board', jobId: 'job-board' },
    ]);
    expect(byEnv.terms).toContain('full stack');
    expect(queue.add).toHaveBeenCalledWith(
      'scan',
      { sourceId: 'fake', terms: byEnv.terms, trigger: 'manual' },
      { deduplication: { id: 'scan:fake' } },
    );

    const custom = (
      await api()
        .post('/api/discovery/scan')
        .send({ sources: ['fake', 'linkedin'], terms: ['nestjs'] })
        .expect(202)
    ).body as ScanResultDto;
    expect(custom).toMatchObject({ terms: ['nestjs'], unknown: ['linkedin'], inactive: [] });
  });

  it('POST /discovery/scan avisa que a fonte desligada não buscou nada, e por quê', async () => {
    const all = (
      await api().post('/api/discovery/scan').set('Content-Type', 'application/json').expect(202)
    ).body as ScanResultDto;
    expect(all.queued.map((item) => item.sourceId)).toEqual(['fake']);
    expect(all.inactive).toEqual([
      { sourceId: 'board', reason: NO_COMPANIES_REASON },
      { sourceId: 'parado', reason: 'PARADO_COMPANIES vazio — nenhuma empresa para buscar' },
    ]);

    queue.add.mockClear();
    const only = (
      await api()
        .post('/api/discovery/scan')
        .send({ sources: ['parado'] })
        .expect(202)
    ).body as ScanResultDto;
    expect(only).toMatchObject({ queued: [], unknown: [], inactive: [{ sourceId: 'parado' }] });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('POST /discovery/scan não duplica fonte que já está na fila', async () => {
    await track('acme');
    queue.getDeduplicationJobId.mockResolvedValue('job-antigo');

    const result = (
      await api().post('/api/discovery/scan').set('Content-Type', 'application/json').expect(202)
    ).body as ScanResultDto;

    expect(result).toMatchObject({ queued: [], alreadyQueued: ['fake', 'board'] });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('POST /discovery/scan valida o corpo', async () => {
    await api()
      .post('/api/discovery/scan')
      .send({ terms: ['x'] })
      .expect(400);
    await api().post('/api/discovery/scan').send({ sources: [] }).expect(400);
  });

  it('GET /discovery/runs lista o histórico, mais recente primeiro, com filtro', async () => {
    fake.jobs = [posting(1)];
    await runner.run('fake', ['primeira'], 'manual');
    await runner.run('fake', ['segunda'], 'schedule');

    // Referência: tudo numa página. Comparar objetos inteiros faz a diferença,
    // se houver, mostrar id e startedAt — o que importa num erro de cursor.
    const all = (await api().get('/api/discovery/runs?limit=10').expect(200))
      .body as Page<SourceRunDto>;
    expect(all.items.map((run) => run.terms[0])).toEqual(['segunda', 'primeira']);

    const first = (await api().get('/api/discovery/runs?limit=1').expect(200))
      .body as Page<SourceRunDto>;
    expect(first.items).toEqual(all.items.slice(0, 1));

    const second = (
      await api().get(`/api/discovery/runs?limit=1&cursor=${first.nextCursor}`).expect(200)
    ).body as Page<SourceRunDto>;
    expect({ cursor: first.nextCursor, items: second.items }).toEqual({
      cursor: first.nextCursor,
      items: all.items.slice(1, 2),
    });
    expect(second.nextCursor).toBeNull();

    const none = (await api().get('/api/discovery/runs?sourceId=gupy').expect(200)).body;
    expect(none).toEqual({ items: [], nextCursor: null });
  });
});
