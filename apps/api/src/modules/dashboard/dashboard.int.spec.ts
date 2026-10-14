import type { ApplicationStatus, DashboardDto } from '@busca-vagas/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestApp, describeDb, resetDatabase, type TestApp } from '../../../test/helpers';
import type { Prisma } from '../../generated/prisma/client';
import { DashboardModule } from './dashboard.module';
import { DashboardService } from './dashboard.service';

const SP = 'America/Sao_Paulo';
/** Sábado, 10/10/2026, 15h em São Paulo. */
const NOW = new Date('2026-10-10T18:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describeDb('Painel (integração)', () => {
  let t: TestApp;
  let service: DashboardService;
  let n = 0;

  beforeAll(async () => {
    t = await createTestApp([DashboardModule]);
    service = t.app.get(DashboardService);
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
        source: 'manual',
        title: `Vaga ${n}`,
        company: 'Acme',
        scoredVersion: 1,
        firstSeenAt: NOW,
        ...data,
      },
    });
  }

  /** Candidatura com o histórico dado: [status, dias depois da candidatura]. */
  async function application(
    events: [ApplicationStatus, number][],
    data: Partial<Prisma.ApplicationUncheckedCreateInput> = {},
  ) {
    const created = await job();
    const appliedAt = ago(30 * DAY);
    const last = events.at(-1)?.[0] ?? 'applied';
    return t.prisma.application.create({
      data: {
        jobId: created.id,
        status: last,
        appliedAt,
        ...data,
        events: {
          create: events.map(([status, days]) => ({
            status,
            occurredAt: new Date(appliedAt.getTime() + days * DAY),
          })),
        },
      },
    });
  }

  it('vazio: série de 14 dias com zero e nada mais', async () => {
    const dashboard = await service.get(NOW, SP);
    expect(dashboard.newJobsPerDay).toHaveLength(14);
    expect(dashboard.newJobsPerDay[0]).toEqual({ date: '2026-09-27', count: 0 });
    expect(dashboard.newJobsPerDay.at(-1)).toEqual({ date: '2026-10-10', count: 0 });
    expect(dashboard).toMatchObject({
      newLast24h: 0,
      highScoreInbox: 0,
      topNew: [],
      upcomingSteps: [],
      funnel: { applied: 0, inProcess: 0, offer: 0 },
      medianDaysToFirstResponse: null,
      savedClosed: 0,
    });
  });

  it('vagas por dia no fuso local: 23h de ontem conta para ontem', async () => {
    await job({ firstSeenAt: new Date('2026-10-10T02:30:00.000Z') }); // 09/10, 23h30 em SP
    await job({ firstSeenAt: new Date('2026-10-10T03:30:00.000Z') }); // 10/10, 0h30 em SP
    await job({ firstSeenAt: new Date('2026-10-10T12:00:00.000Z') });
    await job({ firstSeenAt: ago(20 * DAY) }); // fora da janela

    const { newJobsPerDay, newLast24h } = await service.get(NOW, SP);
    const byDate = Object.fromEntries(newJobsPerDay.map((d) => [d.date, d.count]));
    expect(byDate['2026-10-09']).toBe(1);
    expect(byDate['2026-10-10']).toBe(2);
    expect(newJobsPerDay.reduce((sum, d) => sum + d.count, 0)).toBe(3);
    expect(newLast24h).toBe(3);
  });

  it('melhores novas: caixa, últimos 7 dias, compatíveis, pontuadas, pela nota', async () => {
    await job({ title: 'B', score: 850 });
    await job({ title: 'A', score: 910 });
    await job({ title: 'Velha', score: 990, firstSeenAt: ago(8 * DAY) });
    await job({ title: 'Salva', score: 990, triage: 'saved' });
    await job({ title: 'Incompatível', score: 0, incompatible: true });
    await job({ title: 'Na fila', score: 990, scoredVersion: null });
    await job({ title: 'Sem nota', score: null });

    const dashboard = await service.get(NOW, SP);
    expect(dashboard.topNew.map((j) => j.title)).toEqual(['A', 'B']);
    expect(dashboard.highScoreInbox).toBe(3); // A, B e a velha
  });

  it('encerradas: fora das melhores novas; salvas encerradas (sem candidatura) contadas', async () => {
    await job({ title: 'Aberta', score: 900 });
    await job({ title: 'Fechada', score: 950, closedAt: ago(DAY) });
    await job({ title: 'Prazo vencido', score: 950, deadline: ago(DAY) });
    await job({ title: 'Prazo futuro', score: 800, deadline: new Date(NOW.getTime() + DAY) });
    await job({ title: 'Salva fechada', triage: 'saved', closedAt: ago(DAY) });
    await job({ title: 'Salva vencida', triage: 'saved', deadline: ago(2 * DAY) });
    await job({ title: 'Salva aberta', triage: 'saved' });
    const applied = await job({
      title: 'Salva fechada com candidatura',
      triage: 'saved',
      closedAt: ago(DAY),
    });
    await t.prisma.application.create({
      data: { jobId: applied.id, status: 'applied', appliedAt: NOW },
    });

    const dashboard = await service.get(NOW, SP);
    expect(dashboard.topNew.map((j) => j.title)).toEqual(['Aberta', 'Prazo futuro']);
    expect(dashboard.highScoreInbox).toBe(2);
    expect(dashboard.savedClosed).toBe(2);
  });

  it('nota de preferências antigas fica fora até a fila recalcular', async () => {
    await t.prisma.preferences.create({ data: { id: 1, version: 2 } });
    await job({ title: 'Atual', score: 850, scoredVersion: 2 });
    await job({ title: 'Antiga', score: 990, scoredVersion: 1 });

    const dashboard = await service.get(NOW, SP);
    expect(dashboard.topNew.map((j) => j.title)).toEqual(['Atual']);
    expect(dashboard.topNew[0]?.scorePending).toBe(false);
    expect(dashboard.highScoreInbox).toBe(1);
  });

  it('próximas etapas: de hoje (meia-noite local) em diante, só abertas, da mais próxima', async () => {
    const todayMorning = new Date('2026-10-10T11:00:00.000Z'); // 8h em SP, já passou
    await application([['applied', 0]], {
      nextStepAt: new Date(NOW.getTime() + 5 * DAY),
      nextStepNote: 'depois',
    });
    await application(
      [
        ['applied', 0],
        ['in_process', 2],
      ],
      { nextStepAt: todayMorning, nextStepNote: 'hoje' },
    );
    await application([['applied', 0]], { nextStepAt: ago(2 * DAY), nextStepNote: 'passou' });
    await application(
      [
        ['applied', 0],
        ['rejected', 3],
      ],
      { nextStepAt: new Date(NOW.getTime() + DAY), nextStepNote: 'recusada' },
    );

    const { upcomingSteps, stepsNextDays } = await service.get(NOW, SP);
    expect(upcomingSteps.map((a) => a.nextStepNote)).toEqual(['hoje', 'depois']);
    expect(stepsNextDays).toBe(2);
  });

  it('etapas nos próximos 7 dias: de hoje até o fim do 7º dia, no calendário local', async () => {
    // NOW = sábado 10/10, 15h em SP. A janela vai até sexta 16/10, 23h59.
    await application([['applied', 0]], {
      nextStepAt: new Date('2026-10-17T02:00:00.000Z'), // sexta 16/10, 23h em SP
      nextStepNote: 'sexta à noite',
    });
    await application([['applied', 0]], {
      nextStepAt: new Date('2026-10-17T03:30:00.000Z'), // sábado 17/10, 0h30 em SP
      nextStepNote: 'fora',
    });

    const { upcomingSteps, stepsNextDays } = await service.get(NOW, SP);
    expect(stepsNextDays).toBe(1);
    // A lista não tem limite de dias: só de quantidade.
    expect(upcomingSteps).toHaveLength(2);
  });

  it('funil pelo histórico e mediana até a primeira resposta', async () => {
    await application([['applied', 0]]); // sem resposta
    await application([
      ['applied', 0],
      ['in_process', 2],
    ]);
    await application([
      ['applied', 0],
      ['offer', 4],
      ['rejected', 9],
    ]); // pulou o processo
    await application([
      ['applied', 0],
      ['rejected', 10],
    ]);

    const dashboard = await service.get(NOW, SP);
    expect(dashboard.funnel).toEqual({ applied: 4, inProcess: 2, offer: 1 });
    // Respostas em 2, 4 e 10 dias -> mediana 4.
    expect(dashboard.medianDaysToFirstResponse).toBe(4);

    await application([
      ['applied', 0],
      ['in_process', 7],
    ]);
    // 2, 4, 7, 10 -> (4 + 7) / 2
    expect((await service.get(NOW, SP)).medianDaysToFirstResponse).toBe(5.5);

    // Desistir não é resposta da empresa.
    await application([
      ['applied', 0],
      ['withdrawn', 1],
    ]);
    expect((await service.get(NOW, SP)).medianDaysToFirstResponse).toBe(5.5);
  });

  it('GET /api/dashboard responde com o formato completo', async () => {
    await job({ score: 900 });
    const body = (await request(t.http).get('/api/dashboard').expect(200)).body as DashboardDto;
    expect(body.newJobsPerDay).toHaveLength(14);
    expect(Object.keys(body).sort()).toEqual([
      'funnel',
      'highScoreInbox',
      'medianDaysToFirstResponse',
      'newJobsPerDay',
      'newLast24h',
      'savedClosed',
      'stepsNextDays',
      'topNew',
      'upcomingSteps',
    ]);
  });
});
