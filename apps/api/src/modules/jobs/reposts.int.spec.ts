import {
  APPLIED_REPOST_REASON,
  DISMISSED_REPOST_REASON,
  MUTED_REPOST_REASON,
  type JobDto,
  type JobHistoryDto,
  type JobPosting,
} from '@busca-vagas/shared';
import { Module } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestApp, describeDb, resetDatabase, type TestApp } from '../../../test/helpers';
import { RetentionService } from '../maintenance/retention.service';
import { jobFingerprint } from './fingerprint';
import { JobsModule } from './jobs.module';
import { JobsService } from './jobs.service';

@Module({ providers: [RetentionService] })
class RetentionTestModule {}

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

/** A mesma vaga, cada fonte com o seu jeito de escrever. */
const gupy = (n = 1): JobPosting => ({
  source: 'gupy',
  externalId: `g${n}`,
  url: `https://acme.gupy.io/jobs/${n}`,
  title: 'Desenvolvedor(a) Full Stack Júnior',
  company: 'Acme Tecnologia Ltda',
  description: null,
  location: 'Campinas, SP',
  workModel: 'hybrid',
  contractType: 'clt',
  seniority: 'junior',
  stack: [],
  salary: null,
  postedAt: null,
});

const greenhouse = (n = 1): JobPosting => ({
  ...gupy(n),
  source: 'greenhouse',
  externalId: `gh${n}`,
  url: `https://job-boards.greenhouse.io/acme/jobs/${n}`,
  title: 'Desenvolvedor Full Stack Júnior (REQ-2231)',
  company: 'ACME TECNOLOGIA',
  location: 'Campinas - São Paulo, Brazil',
  workModel: null,
});

describeDb('Repostadas e duplicadas (integração)', () => {
  let t: TestApp;
  let jobs: JobsService;

  beforeAll(async () => {
    t = await createTestApp([JobsModule, RetentionTestModule]);
    jobs = t.app.get(JobsService);
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });

  const api = () => request(t.http);
  const list = async () =>
    ((await api().get('/api/jobs?limit=50&sort=recent').expect(200)).body.items as JobDto[]).map(
      (job) => ({ url: job.url, triage: job.triage, repost: job.repost, alsoOn: job.alsoOn }),
    );
  /** A vaga anterior "parou de ser vista" há N dias. */
  const age = (url: string, days: number) =>
    t.prisma.job.update({
      where: { url },
      data: { lastSeenAt: ago(days), firstSeenAt: ago(days) },
    });

  it('mesma vaga em duas fontes ao mesmo tempo: uma vaga só, com o outro link', async () => {
    await jobs.ingest([gupy()]);
    const result = await jobs.ingest([greenhouse()]);
    expect(result).toMatchObject({ created: 0, duplicates: 1, reposts: 0 });

    expect(await list()).toEqual([
      {
        url: 'https://acme.gupy.io/jobs/1',
        triage: 'inbox',
        repost: null,
        alsoOn: [{ source: 'greenhouse', url: 'https://job-boards.greenhouse.io/acme/jobs/1' }],
      },
    ]);

    // A Greenhouse trazer o link de novo: "vista", e a vaga continua aberta.
    await t.prisma.job.updateMany({ data: { lastSeenAt: ago(3) } });
    expect(await jobs.ingest([greenhouse()])).toMatchObject({ created: 0, seen: 1 });
    const job = await t.prisma.job.findFirstOrThrow();
    expect(job.lastSeenAt.getTime()).toBeGreaterThan(ago(1).getTime());
  });

  it('mesma fonte e mesmo id com outro link (Indeed por e-mail): a mesma vaga, sem link extra', async () => {
    const indeed = (link: string): JobPosting => ({
      ...gupy(),
      source: 'indeed',
      externalId: 'abc123',
      url: `https://engage.indeed.com/f/a/${link}`,
    });
    await jobs.ingest([indeed('primeiro')]);
    await t.prisma.job.updateMany({ data: { firstSeenAt: ago(1), lastSeenAt: ago(1) } });

    expect(await jobs.ingest([indeed('segundo'), indeed('terceiro')])).toMatchObject({
      created: 0,
      seen: 1,
      duplicates: 0,
    });
    const all = await t.prisma.job.findMany({ include: { aliases: true } });
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ url: 'https://engage.indeed.com/f/a/primeiro', aliases: [] });
    expect(all[0]!.lastSeenAt.getTime()).toBeGreaterThan(ago(0.5).getTime());
  });

  it('duas vezes na mesma leva: a segunda vira link da primeira', async () => {
    const result = await jobs.ingest([gupy(1), greenhouse(1), gupy(2)]);
    expect(result).toMatchObject({ created: 1, duplicates: 2 });
    expect(await t.prisma.jobAlias.count()).toBe(2);
  });

  it('repostada depois de sumir: vaga nova ligada à anterior; de salva, entra na caixa', async () => {
    await jobs.ingest([gupy(1)]);
    const first = await t.prisma.job.findFirstOrThrow();
    await api().put(`/api/jobs/${first.id}/triage`).send({ status: 'saved' }).expect(200);
    await age('https://acme.gupy.io/jobs/1', 20);

    await jobs.ingest([gupy(2)]);
    const repost = (await list()).find((job) => job.url === 'https://acme.gupy.io/jobs/2');
    expect(repost).toMatchObject({
      triage: 'inbox',
      repost: { count: 1, previous: { id: first.id, triage: 'saved', application: null } },
    });
  });

  it('repostada de vaga descartada: entra já descartada, com o motivo', async () => {
    await jobs.ingest([gupy(1)]);
    const first = await t.prisma.job.findFirstOrThrow();
    await api().put(`/api/jobs/${first.id}/triage`).send({ status: 'dismissed' }).expect(200);
    await age('https://acme.gupy.io/jobs/1', 20);

    const result = await jobs.ingest([gupy(2)]);
    expect(result).toMatchObject({ created: 1, duplicates: 0, reposts: 1 });

    const repost = (
      (await api().get('/api/jobs?triage=dismissed').expect(200)).body.items as JobDto[]
    ).find((job) => job.url === 'https://acme.gupy.io/jobs/2');
    expect(repost).toMatchObject({
      triage: 'dismissed',
      dismissReason: DISMISSED_REPOST_REASON,
      repost: {
        count: 1,
        previous: { id: first.id, triage: 'dismissed', application: null },
      },
      alsoOn: [],
    });
    expect(repost!.repost!.previousSeenAt).not.toBeNull();
  });

  it('"descartar sempre": a repostagem entra descartada; desligar volta ao normal', async () => {
    await jobs.ingest([gupy(1)]);
    const first = await t.prisma.job.findFirstOrThrow();
    await api().put(`/api/jobs/${first.id}/triage`).send({ status: 'dismissed' }).expect(200);

    const muted = (
      await api().put(`/api/jobs/${first.id}/reposts`).send({ muted: true }).expect(200)
    ).body as JobHistoryDto;
    expect(muted.repostsMuted).toBe(true);
    await api().put(`/api/jobs/${first.id}/reposts`).send({ muted: true }).expect(200);
    await api().put(`/api/jobs/${first.id}/reposts`).send({}).expect(400);

    await age('https://acme.gupy.io/jobs/1', 20);
    await jobs.ingest([gupy(2)]);
    const second = await t.prisma.job.findUniqueOrThrow({
      where: { url: 'https://acme.gupy.io/jobs/2' },
    });
    expect(second).toMatchObject({ triage: 'dismissed', dismissReason: MUTED_REPOST_REASON });
    expect(second.triagedAt).not.toBeNull();

    await api().put(`/api/jobs/${second.id}/reposts`).send({ muted: false }).expect(200);
    await age('https://acme.gupy.io/jobs/2', 20);
    await jobs.ingest([gupy(3)]);
    const third = await t.prisma.job.findUniqueOrThrow({
      where: { url: 'https://acme.gupy.io/jobs/3' },
    });
    // Sem o "descartar sempre", vale a regra geral: a anterior estava
    // descartada, então a repostagem também entra descartada.
    expect(third).toMatchObject({
      triage: 'dismissed',
      dismissReason: DISMISSED_REPOST_REASON,
      repostCount: 2,
      repostOfId: second.id,
    });
  });

  it('histórico: as outras vezes, inclusive a apagada pela limpeza, e a candidatura', async () => {
    await jobs.ingest([gupy(1)]);
    const first = await t.prisma.job.findFirstOrThrow();
    await t.prisma.application.create({
      data: { jobId: first.id, status: 'applied', appliedAt: new Date('2026-09-01T12:00:00Z') },
    });
    await age('https://acme.gupy.io/jobs/1', 30);
    await t.prisma.forgottenJob.create({
      data: {
        url: 'https://acme.gupy.io/jobs/0',
        source: 'gupy',
        forgottenAt: ago(60),
        fingerprint: jobFingerprint(gupy()),
      },
    });

    await jobs.ingest([gupy(2)]);
    const current = await t.prisma.job.findUniqueOrThrow({
      where: { url: 'https://acme.gupy.io/jobs/2' },
    });
    expect(current.repostCount).toBe(2);
    // Já se candidatou à anterior: a repostagem não entra na Caixa.
    expect(current).toMatchObject({ triage: 'dismissed', dismissReason: APPLIED_REPOST_REASON });

    const history = (await api().get(`/api/jobs/${current.id}/history`).expect(200))
      .body as JobHistoryDto;
    expect(history.repostsMuted).toBe(false);
    expect(history.occurrences.map((item) => [item.url, item.triage])).toEqual([
      ['https://acme.gupy.io/jobs/1', 'inbox'],
      ['https://acme.gupy.io/jobs/0', 'forgotten'],
    ]);
    expect(history.occurrences[0]?.application).toMatchObject({
      status: 'applied',
      appliedAt: '2026-09-01T12:00:00.000Z',
    });

    const dto = (await api().get(`/api/jobs/${current.id}`).expect(200)).body as JobDto;
    expect(dto.repost?.previous?.application).toMatchObject({ status: 'applied' });

    await api().get('/api/jobs/nao-existe/history').expect(404);
  });

  it('fora da janela de 180 dias não conta; outra cidade é outra vaga', async () => {
    await jobs.ingest([gupy(1)]);
    await age('https://acme.gupy.io/jobs/1', 200);
    await jobs.ingest([gupy(2), { ...gupy(3), location: 'Sorocaba, SP' }]);
    expect(await t.prisma.job.count({ where: { repostCount: { gt: 0 } } })).toBe(0);
    expect(await t.prisma.jobAlias.count()).toBe(0);
  });

  it('limpeza: a descartada apagada leva os outros links e a impressão para a lista de lembradas', async () => {
    await jobs.ingest([gupy(1)]);
    await jobs.ingest([greenhouse(1)]);
    await t.prisma.job.updateMany({ data: { triage: 'dismissed', triagedAt: ago(40) } });

    await t.app.get(RetentionService).run();

    expect(
      await t.prisma.forgottenJob.findMany({
        select: { url: true, fingerprint: true },
        orderBy: { url: 'asc' },
      }),
    ).toEqual([
      { url: 'https://acme.gupy.io/jobs/1', fingerprint: jobFingerprint(gupy()) },
      { url: 'https://job-boards.greenhouse.io/acme/jobs/1', fingerprint: jobFingerprint(gupy()) },
    ]);
    expect(await t.prisma.jobAlias.count()).toBe(0);

    // O link antigo não volta; um link novo é repostagem.
    const result = await jobs.ingest([greenhouse(1), gupy(9)]);
    expect(result).toMatchObject({ ignored: 1, created: 1, reposts: 1 });
  });

  it('vaga manual e edição calculam a impressão; vagas antigas ganham a impressão na subida', async () => {
    const manual = (
      await api()
        .post('/api/jobs')
        .send({ title: 'Desenvolvedor Full Stack Júnior', company: 'Acme Tecnologia' })
        .expect(201)
    ).body as JobDto;
    let row = await t.prisma.job.findUniqueOrThrow({ where: { id: manual.id } });
    expect(row.fingerprint).toBe('acmetecnologia|desenvolvedor full stack junior|');

    await api().patch(`/api/jobs/${manual.id}`).send({ workModel: 'remote' }).expect(200);
    row = await t.prisma.job.findUniqueOrThrow({ where: { id: manual.id } });
    expect(row.fingerprint).toBe('acmetecnologia|desenvolvedor full stack junior|remoto');

    await t.prisma.job.update({ where: { id: manual.id }, data: { fingerprint: null } });
    expect(await jobs.backfillFingerprints(1)).toBe(1);
    row = await t.prisma.job.findUniqueOrThrow({ where: { id: manual.id } });
    expect(row.fingerprint).toBe('acmetecnologia|desenvolvedor full stack junior|remoto');
  });
});
