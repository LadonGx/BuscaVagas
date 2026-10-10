import type {
  JobDto,
  JobPosting,
  Page,
  PreferencesDto,
  PutPreferencesResultDto,
  StackOptionDto,
} from '@busca-vagas/shared';
import { Global, Module } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createTestApp, describeDb, resetDatabase, type TestApp } from '../../../test/helpers';
import { JobsModule } from '../jobs/jobs.module';
import { JobsService } from '../jobs/jobs.service';
import { SCORE_REQUESTER } from '../scoring/scoring.constants';
import { ScoringService } from '../scoring/scoring.service';
import { PreferencesModule } from './preferences.module';

/** Fila falsa: registra os pedidos; o teste roda o cálculo quando quiser. */
const requester = { request: vi.fn(async (_reason: string) => true) };

@Global()
@Module({
  providers: [ScoringService, { provide: SCORE_REQUESTER, useValue: requester }],
  exports: [ScoringService, SCORE_REQUESTER],
})
class FakeScoringModule {}

const posting = (n: number, values: Partial<JobPosting> = {}): JobPosting => ({
  source: 'fake',
  externalId: String(n),
  url: `https://jobs.example.com/${n}`,
  title: `Desenvolvedor ${n}`,
  company: 'Acme',
  description: null,
  location: 'Campinas, SP',
  workModel: 'remote',
  contractType: 'clt',
  seniority: 'junior',
  stack: ['node.js', 'react', 'nestjs'],
  salary: null,
  postedAt: null,
  ...values,
});

const MY_PREFS = {
  stacksCore: ['node.js', 'react', 'nestjs'],
  stacksAvoid: ['php'],
  seniorities: ['junior'],
  workModels: ['remote', 'hybrid'],
  cities: ['Americana', 'Campinas'],
  contractTypes: ['clt', 'pj'],
};

describeDb('Preferências e nota (integração)', () => {
  let t: TestApp;
  let jobs: JobsService;
  let scoring: ScoringService;

  beforeAll(async () => {
    t = await createTestApp([FakeScoringModule, JobsModule, PreferencesModule]);
    jobs = t.app.get(JobsService);
    scoring = t.app.get(ScoringService);
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    requester.request.mockClear();
  });

  const api = () => request(t.http);
  const list = async (query = '') =>
    (await api().get(`/api/jobs${query}`).expect(200)).body as Page<JobDto>;

  it('GET sem nada salvo: neutras, versão 0', async () => {
    const prefs = (await api().get('/api/preferences').expect(200)).body as PreferencesDto;
    expect(prefs).toMatchObject({ configured: false, version: 0, updatedAt: null, stacksCore: [] });
  });

  it('PUT salva, sobe a versão, pede o recálculo e avisa stack desconhecida', async () => {
    const first = (
      await api()
        .put('/api/preferences')
        .send({ ...MY_PREFS, stacksPlus: ['elixir-nova'] })
        .expect(200)
    ).body as PutPreferencesResultDto;

    expect(first).toMatchObject({
      configured: true,
      version: 1,
      rescoreQueued: true,
      unknownStacks: ['elixir-nova'],
    });
    expect(requester.request).toHaveBeenCalledWith('preferences');

    const second = (await api().put('/api/preferences').send({}).expect(200))
      .body as PreferencesDto;
    expect(second).toMatchObject({ configured: false, version: 2 });
  });

  it('PUT inválido = 400 com o campo', async () => {
    const response = await api()
      .put('/api/preferences')
      .send({ stacksCore: ['php'], stacksAvoid: ['php'] })
      .expect(400);
    expect(JSON.stringify(response.body)).toContain('stacksAvoid');
  });

  it('a vaga entra sem nota (pendente) e a fila calcula depois', async () => {
    await api().put('/api/preferences').send(MY_PREFS).expect(200);
    requester.request.mockClear();

    await jobs.ingest([posting(1)]);
    expect(requester.request).toHaveBeenCalledWith('ingest');

    // Antes do cálculo: listagem responde normalmente, nota pendente.
    let [job] = (await list()).items;
    expect(job).toMatchObject({ score: null, scorePending: true });

    const before = await t.prisma.job.findFirstOrThrow();
    expect(await scoring.scoreStale()).toEqual({ scored: 1, batches: 1 });

    [job] = (await list()).items;
    expect(job).toMatchObject({ score: 1000, scoreCoverage: 100, scorePending: false });
    expect(job?.scoreReasons[0]).toMatchObject({ criterion: 'stack', kind: 'plus' });

    // Calcular a nota não é editar a vaga.
    const after = await t.prisma.job.findFirstOrThrow();
    expect(after.updatedAt).toEqual(before.updatedAt);

    // Nada pendente: o próximo cálculo não faz nada.
    expect(await scoring.scoreStale()).toEqual({ scored: 0, batches: 0 });
  });

  it('mudar as preferências recalcula só pela fila; a nota antiga fica até lá', async () => {
    await api().put('/api/preferences').send(MY_PREFS).expect(200);
    await jobs.ingest([posting(1, { seniority: 'senior' })]);
    await scoring.scoreStale();
    // stack 35 + sênior 0 + remota 20 + CLT 10 = 65 de 90
    expect((await list()).items[0]?.score).toBe(722);

    await api()
      .put('/api/preferences')
      .send({ ...MY_PREFS, seniorities: ['senior'] })
      .expect(200);
    expect((await list()).items[0]?.score).toBe(722);

    await scoring.scoreStale();
    expect((await list()).items[0]?.score).toBe(1000);
  });

  it('editar a vaga deixa a nota pendente e pede o cálculo', async () => {
    await api().put('/api/preferences').send(MY_PREFS).expect(200);
    await jobs.ingest([posting(1)]);
    await scoring.scoreStale();
    const [job] = (await list()).items;
    requester.request.mockClear();

    const edited = (
      await api().patch(`/api/jobs/${job!.id}`).send({ title: 'Desenvolvedor PHP' }).expect(200)
    ).body as JobDto;
    expect(edited.scorePending).toBe(true);
    expect(requester.request).toHaveBeenCalledWith('job:update');

    await scoring.scoreStale();
    const [rescored] = (await list()).items;
    expect(rescored).toMatchObject({ score: 0, incompatible: true });
  });

  it('listagem: por nota quando há preferências, sem nota no fim, cursor estável', async () => {
    await jobs.ingest([
      posting(1), // 1000
      posting(2, { stack: ['node.js', 'react'], seniority: 'mid' }), // 731
      posting(3, { stack: ['java'] }), // 611
      posting(4, { workModel: 'onsite' }), // incompatível
    ]);

    // Sem preferências: ordem por data, nenhuma nota.
    expect((await list()).items.every((job) => job.score === null)).toBe(true);

    await api().put('/api/preferences').send(MY_PREFS).expect(200);
    await scoring.scoreStale();
    await jobs.ingest([posting(5)]); // ainda sem nota

    const ids = (page: Page<JobDto>) => page.items.map((job) => job.externalId);

    const first = await list('?limit=2');
    expect(ids(first)).toEqual(['1', '2']);
    const second = await list(`?limit=2&cursor=${first.nextCursor}`);
    expect(ids(second)).toEqual(['3', '4']);
    const third = await list(`?limit=2&cursor=${second.nextCursor}`);
    expect(ids(third)).toEqual(['5']);
    expect(third.nextCursor).toBeNull();

    expect(ids(await list('?hideIncompatible=true&minScore=1'))).toEqual(['1', '2', '3']);
    expect(ids(await list('?minScore=700'))).toEqual(['1', '2']);
    expect(ids(await list('?sort=recent&limit=1'))).toEqual(['5']);

    await api().get(`/api/jobs?sort=recent&cursor=${first.nextCursor}`).expect(400);
  });

  it('GET /preferences/stacks: conhecidas + as das vagas, com contagem', async () => {
    await jobs.ingest([
      posting(1, { stack: ['node.js', 'zig'] }),
      posting(2, { stack: ['node.js'] }),
    ]);

    const stacks = (await api().get('/api/preferences/stacks').expect(200))
      .body as StackOptionDto[];
    expect(stacks[0]).toEqual({ name: 'node.js', known: true, jobs: 2 });
    expect(stacks).toContainEqual({ name: 'zig', known: false, jobs: 1 });
    expect(stacks).toContainEqual({ name: 'php', known: true, jobs: 0 });
  });

  it('POST /preferences/rescore invalida tudo e pede o cálculo', async () => {
    await api().put('/api/preferences').send(MY_PREFS).expect(200);
    await jobs.ingest([posting(1)]);
    await scoring.scoreStale();
    requester.request.mockClear();

    const response = await api().post('/api/preferences/rescore').expect(202);
    expect(response.body).toEqual({ queued: true });
    expect((await list()).items[0]?.scorePending).toBe(true);
    expect(await scoring.scoreStale()).toMatchObject({ scored: 1 });
  });
});
