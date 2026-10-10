import type { JobPosting, RetentionReportDto } from '@busca-vagas/shared';
import { Module } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestApp, describeDb, resetDatabase, type TestApp } from '../../../test/helpers';
import type { Env } from '../../config/env';
import { JobsModule } from '../jobs/jobs.module';
import { JobsService } from '../jobs/jobs.service';
import { MaintenanceController } from './maintenance.controller';
import { RetentionService } from './retention.service';

/** Só a retenção, sem fila nem agenda (não precisam de Redis aqui). */
@Module({ controllers: [MaintenanceController], providers: [RetentionService] })
class RetentionTestModule {}

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date();
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

const posting = (n: number): JobPosting => ({
  source: 'fake',
  externalId: String(n),
  url: `https://jobs.example.com/${n}`,
  title: `Vaga ${n}`,
  company: 'Acme',
  description: null,
  location: null,
  workModel: 'remote',
  contractType: null,
  seniority: null,
  stack: [],
  salary: null,
  postedAt: null,
});

describeDb('Retenção (integração)', () => {
  let t: TestApp;
  let jobs: JobsService;
  let retention: RetentionService;

  beforeAll(async () => {
    t = await createTestApp([JobsModule, RetentionTestModule]);
    jobs = t.app.get(JobsService);
    retention = t.app.get(RetentionService);
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });

  const api = () => request(t.http);
  const idOf = async (n: number) =>
    (await t.prisma.job.findFirstOrThrow({ where: { externalId: String(n) } })).id;
  const remaining = async () =>
    (await t.prisma.job.findMany({ select: { externalId: true, title: true } }))
      .map((job) => job.externalId ?? job.title)
      .sort();

  /**
   * Monta um cenário com uma vaga de cada tipo:
   *   1 descartada há 40 dias          → sai (e a URL fica lembrada)
   *   2 descartada há 5 dias           → fica
   *   3 caixa, fonte não traz há 40 d  → sai (sem lembrar)
   *   4 caixa, vista há 2 dias         → fica
   *   5 salva há 90 dias               → fica
   *   6 caixa antiga com candidatura   → fica
   *   manual na caixa, antiga          → fica
   */
  async function scenario() {
    await jobs.ingest([1, 2, 3, 4, 5, 6].map(posting));

    await t.prisma.job.update({
      where: { id: await idOf(1) },
      data: { triage: 'dismissed', triagedAt: ago(40), lastSeenAt: ago(1) },
    });
    await t.prisma.job.update({
      where: { id: await idOf(2) },
      data: { triage: 'dismissed', triagedAt: ago(5) },
    });
    await t.prisma.job.update({ where: { id: await idOf(3) }, data: { lastSeenAt: ago(40) } });
    await t.prisma.job.update({ where: { id: await idOf(4) }, data: { lastSeenAt: ago(2) } });
    await t.prisma.job.update({
      where: { id: await idOf(5) },
      data: { triage: 'saved', triagedAt: ago(90), lastSeenAt: ago(90) },
    });
    const withApplication = await idOf(6);
    await t.prisma.job.update({ where: { id: withApplication }, data: { lastSeenAt: ago(60) } });
    await t.prisma.application.create({
      data: { jobId: withApplication, status: 'rejected', appliedAt: ago(60) },
    });
    await t.prisma.job.create({
      data: {
        source: 'manual',
        title: 'manual-antiga',
        company: 'Acme',
        firstSeenAt: ago(90),
        lastSeenAt: ago(90),
      },
    });

    await t.prisma.sourceRun.createMany({
      data: [
        { sourceId: 'fake', status: 'ok', startedAt: ago(45) },
        { sourceId: 'fake', status: 'ok', startedAt: ago(1) },
      ],
    });
  }

  it('prévia conta sem apagar', async () => {
    await scenario();

    const preview = (await api().get('/api/maintenance/retention').expect(200))
      .body as RetentionReportDto;

    expect(preview).toMatchObject({
      enabled: true,
      days: 30,
      dismissed: 1,
      stale: 1,
      sourceRuns: 1,
      forgottenExpired: 0,
      dryRun: true,
    });
    expect(await t.prisma.job.count()).toBe(7);
  });

  it('apaga só descartadas antigas e caixa esquecida; o resto fica', async () => {
    await scenario();

    const result = (await api().post('/api/maintenance/retention').expect(200))
      .body as RetentionReportDto;

    expect(result).toMatchObject({ dismissed: 1, stale: 1, sourceRuns: 1, dryRun: false });
    expect(await remaining()).toEqual(['2', '4', '5', '6', 'manual-antiga']);
    expect(await t.prisma.application.count()).toBe(1);
    expect(await t.prisma.sourceRun.count()).toBe(1);
  });

  it('descartada apagada não volta; caixa esquecida volta como nova', async () => {
    await scenario();
    await retention.run(NOW);

    expect(await t.prisma.forgottenJob.findMany({ select: { url: true, source: true } })).toEqual([
      { url: 'https://jobs.example.com/1', source: 'fake' },
    ]);

    const again = await jobs.ingest([posting(1), posting(3)]);
    expect(again).toEqual({ received: 2, created: 1, seen: 0, ignored: 1 });
    expect(await remaining()).toEqual(['2', '3', '4', '5', '6', 'manual-antiga']);
  });

  it('URL lembrada expira e a vaga pode voltar', async () => {
    await t.prisma.forgottenJob.createMany({
      data: [
        { url: 'https://jobs.example.com/1', source: 'fake', forgottenAt: ago(200) },
        { url: 'https://jobs.example.com/2', source: 'fake', forgottenAt: ago(10) },
      ],
    });

    const result = await retention.run(NOW);
    expect(result.forgottenExpired).toBe(1);

    const again = await jobs.ingest([posting(1), posting(2)]);
    expect(again).toMatchObject({ created: 1, ignored: 1 });
  });

  it('descartada que você salvou de novo não sai', async () => {
    await scenario();
    await t.prisma.job.update({ where: { id: await idOf(1) }, data: { triage: 'saved' } });

    const result = await retention.run(NOW);
    expect(result.dismissed).toBe(0);
    expect(await t.prisma.forgottenJob.count()).toBe(0);
  });

  it('RETENTION_DAYS=0 desliga: nada é apagado', async () => {
    await scenario();
    const config = { get: (key: string) => (key === 'RETENTION_DAYS' ? 0 : 180) };
    const off = new RetentionService(t.prisma, config as unknown as ConfigService<Env, true>);

    expect(await off.preview(NOW)).toMatchObject({ enabled: false, dismissed: 0, dryRun: true });
    expect(await off.run(NOW)).toMatchObject({ enabled: false, dryRun: false });
    expect(await t.prisma.job.count()).toBe(7);
  });
});
