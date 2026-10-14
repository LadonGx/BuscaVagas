import type { ApplicationStatus, MetricsDto } from '@busca-vagas/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestApp, describeDb, resetDatabase, type TestApp } from '../../../test/helpers';
import type { Prisma } from '../../generated/prisma/client';
import { MetricsModule } from './metrics.module';
import { MetricsService } from './metrics.service';

const SP = 'America/Sao_Paulo';
/** Quarta, 14/10/2026, 15h em São Paulo. */
const NOW = new Date('2026-10-14T18:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

describeDb('Métricas (integração)', () => {
  let t: TestApp;
  let service: MetricsService;
  let n = 0;

  beforeAll(async () => {
    t = await createTestApp([MetricsModule]);
    service = t.app.get(MetricsService);
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });

  async function job(data: Partial<Prisma.JobCreateInput> = {}) {
    n += 1;
    return t.prisma.job.create({
      data: {
        source: 'gupy',
        title: `Vaga ${n}`,
        company: 'Acme',
        firstSeenAt: ago(5),
        ...data,
      },
    });
  }

  /** Candidatura com eventos: [status, dias depois de aplicar]. */
  async function application(
    appliedDaysAgo: number,
    events: [ApplicationStatus, number][] = [],
    data: Partial<Prisma.JobCreateInput> = {},
  ) {
    const created = await job({ triage: 'saved', ...data });
    const appliedAt = ago(appliedDaysAgo);
    const all: [ApplicationStatus, number][] = [['applied', 0], ...events];
    return t.prisma.application.create({
      data: {
        jobId: created.id,
        status: all.at(-1)![0],
        appliedAt,
        events: {
          create: all.map(([status, days]) => ({
            status,
            occurredAt: new Date(appliedAt.getTime() + days * DAY),
          })),
        },
      },
    });
  }

  /** Currículo com uma seção de competências. */
  async function resumeWith(value: string) {
    await t.prisma.resumeSection.create({
      data: {
        title: 'Competências',
        kind: 'fields',
        position: 0,
        items: { create: { position: 0, data: { label: 'Linguagens', value } } },
      },
    });
  }

  it('rendimento por fonte: vagas do período e candidaturas com resposta', async () => {
    await job();
    await job({ incompatible: true });
    await job({ triage: 'saved' });
    await job({ firstSeenAt: ago(120) }); // fora dos 90 dias
    await job({ source: 'greenhouse' });
    await application(10, [['in_process', 3]]);
    await application(4); // sem resposta
    await application(20, [['rejected', 6]], { source: 'greenhouse' });

    const metrics = await service.get(90, NOW, SP);
    expect(metrics.sources).toEqual([
      { sourceId: 'gupy', found: 5, compatible: 4, saved: 3, applied: 2, responded: 1 },
      { sourceId: 'greenhouse', found: 2, compatible: 2, saved: 1, applied: 1, responded: 1 },
    ]);

    const all = await service.get(0, NOW, SP);
    expect(all.sources[0]).toMatchObject({ sourceId: 'gupy', found: 6 });
    expect(all).toMatchObject({ days: null, since: null });
  });

  it('stacks: as mais pedidas entre todas as vagas e as que faltam no currículo', async () => {
    await resumeWith('TypeScript, React');
    await job({ stack: ['typescript', 'react', 'docker'] });
    await job({ stack: ['typescript', 'docker'], incompatible: true });
    await job({ stack: ['java', 'docker'] });
    await job({ stack: [] });
    await job({ stack: ['kotlin'], firstSeenAt: ago(200) });

    const { stacks } = await service.get(90, NOW, SP);
    expect(stacks.jobs).toBe(4);
    expect(stacks.resumeHasStacks).toBe(true);
    expect(stacks.top.map((s) => [s.name, s.jobs, s.share, s.inResume])).toEqual([
      ['docker', 3, 0.75, false],
      ['typescript', 2, 0.5, true],
      ['java', 1, 0.25, false],
      ['react', 1, 0.25, true],
    ]);
    expect(stacks.missing.map((s) => s.name)).toEqual(['docker', 'java']);
  });

  it('sem tecnologias no currículo, "faltam" fica vazio', async () => {
    await job({ stack: ['docker'] });
    const { stacks } = await service.get(90, NOW, SP);
    expect(stacks).toMatchObject({ resumeHasStacks: false, missing: [] });
    expect(stacks.top[0]).toMatchObject({ name: 'docker', inResume: false });
  });

  it('tempo até a resposta: mediana, faixas e quem espera há mais de 14 dias', async () => {
    await application(30, [['in_process', 2]]);
    await application(30, [['offer', 5]]);
    await application(30, [['rejected', 10]]);
    await application(60, [['rejected', 40]]);
    await application(30, [['withdrawn', 3]]); // desistiu: não é resposta nem espera
    await application(20); // esperando há 20 dias
    await application(3); // esperando há 3 dias

    const { responses } = await service.get(90, NOW, SP);
    expect(responses).toMatchObject({
      applications: 7,
      responded: 4,
      medianDays: 7.5,
      waiting: 2,
      waitingStale: 1,
    });
    expect(responses.buckets.map((bucket) => bucket.count)).toEqual([1, 1, 1, 0, 1]);
  });

  it('por semana: segundas-feiras no fuso local, enviadas e com resposta', async () => {
    await application(0, [['in_process', 0]]); // qua 14/10
    await application(2); // seg 12/10
    await application(8, [['rejected', 1]]); // ter 06/10
    // Domingo 11/10 às 23h em SP = segunda 12/10 02h em UTC: conta na semana de 05/10.
    const job2 = await job({ triage: 'saved' });
    await t.prisma.application.create({
      data: {
        jobId: job2.id,
        status: 'applied',
        appliedAt: new Date('2026-10-12T02:00:00.000Z'),
        events: { create: { status: 'applied', occurredAt: new Date('2026-10-12T02:00:00.000Z') } },
      },
    });

    const { weekly } = await service.get(30, NOW, SP);
    expect(weekly.at(-1)).toEqual({ week: '2026-10-12', sent: 2, responded: 1 });
    expect(weekly.at(-2)).toEqual({ week: '2026-10-05', sent: 2, responded: 1 });
    expect(weekly[0]!.week).toBe('2026-09-14');
    expect(weekly).toHaveLength(5);
  });

  it('GET /api/metrics: padrão 90 dias; período inválido = 400', async () => {
    const body = (await request(t.http).get('/api/metrics').expect(200)).body as MetricsDto;
    expect(body.days).toBe(90);
    expect(Object.keys(body).sort()).toEqual([
      'days',
      'responses',
      'since',
      'sources',
      'stacks',
      'weekly',
    ]);
    expect(
      ((await request(t.http).get('/api/metrics?days=0').expect(200)).body as MetricsDto).days,
    ).toBeNull();
    await request(t.http).get('/api/metrics?days=7').expect(400);
  });
});
