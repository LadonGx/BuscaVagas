import type { JobPosting, ScanResultDto, SourceInfoDto, SourceRunDto } from '@busca-vagas/shared';
import type { HttpClient, JobSource, SourceQuery } from '@busca-vagas/sources';
import { getQueueToken } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createTestApp, describeDb, resetDatabase, type TestApp } from '../../../test/helpers';
import { QUEUES } from '../../queue/queue.constants';
import { JobsModule } from '../jobs/jobs.module';
import { SOURCE_HTTP_CLIENT, SOURCES } from './discovery.constants';
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

/** Board de empresa falso: não usa termos e devolve vagas filtradas. */
const boardQueries: SourceQuery[] = [];
const boardSource: JobSource = {
  id: 'board',
  displayName: 'Board falso',
  kind: 'company-board',
  fetch: async (query) => {
    boardQueries.push(query);
    return { jobs: [posting(10, 'board')], dropped: 1, filtered: 5 };
  },
};

const queue = {
  add: vi.fn(async (_name: string, data: { sourceId: string }) => ({ id: `job-${data.sourceId}` })),
  getDeduplicationJobId: vi.fn(async (_id: string): Promise<string | null> => null),
};

const http: HttpClient = { getJson: async () => ({}), getText: async () => '' };

/** O módulo de descoberta sem Redis: fila falsa, sem processor nem agenda. */
@Module({
  imports: [JobsModule],
  controllers: [DiscoveryController],
  providers: [
    ScanRunner,
    DiscoveryService,
    { provide: SOURCES, useValue: [fakeSource, boardSource] },
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
  });

  const api = () => request(t.http);

  it('ScanRunner grava as vagas e o histórico com novas vs. já vistas', async () => {
    fake.jobs = [posting(1), posting(2)];
    fake.dropped = 3;

    const first = await runner.run('fake', ['node', 'react'], 'manual');
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

  it('board de empresa: grava as filtradas e não registra termos', async () => {
    const run = await runner.run('board', ['node'], 'schedule');

    expect(run).toMatchObject({ terms: [], jobsFound: 1, jobsNew: 1, dropped: 1, filtered: 5 });
    expect(boardQueries[0]).toEqual({ terms: [] });

    const [listed] = (await api().get('/api/discovery/runs?sourceId=board').expect(200))
      .body as SourceRunDto[];
    expect(listed).toMatchObject({ id: run.id, filtered: 5 });
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
    let sources = (await api().get('/api/discovery/sources').expect(200)).body as SourceInfoDto[];
    expect(sources).toEqual([
      { id: 'fake', displayName: 'Fonte falsa', kind: 'search', lastRun: null },
      { id: 'board', displayName: 'Board falso', kind: 'company-board', lastRun: null },
    ]);

    fake.jobs = [posting(1)];
    await runner.run('fake', ['a'], 'manual');
    await runner.run('fake', ['b'], 'manual');

    sources = (await api().get('/api/discovery/sources').expect(200)).body;
    expect(sources[0]?.lastRun?.terms).toEqual(['b']);
  });

  it('POST /discovery/scan enfileira com os termos do .env ou os pedidos', async () => {
    const byEnv = (await api().post('/api/discovery/scan').expect(202)).body as ScanResultDto;
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
    expect(custom).toMatchObject({ terms: ['nestjs'], unknown: ['linkedin'] });
  });

  it('POST /discovery/scan não duplica fonte que já está na fila', async () => {
    queue.getDeduplicationJobId.mockResolvedValue('job-antigo');

    const result = (await api().post('/api/discovery/scan').expect(202)).body as ScanResultDto;

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

    const runs = (await api().get('/api/discovery/runs?limit=5').expect(200))
      .body as SourceRunDto[];
    expect(runs.map((run) => run.terms[0])).toEqual(['segunda', 'primeira']);

    const none = (await api().get('/api/discovery/runs?sourceId=gupy').expect(200)).body;
    expect(none).toEqual([]);
  });
});
