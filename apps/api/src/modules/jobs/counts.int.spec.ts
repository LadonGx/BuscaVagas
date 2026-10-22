import type { JobCountsDto, JobDto } from '@busca-vagas/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestApp, describeDb, resetDatabase, type TestApp } from '../../../test/helpers';
import type { Prisma } from '../../generated/prisma/client';
import { JobsModule } from './jobs.module';

describeDb('Contagens e filtro "com candidatura" (integração)', () => {
  let t: TestApp;
  let n = 0;

  beforeAll(async () => {
    t = await createTestApp([JobsModule]);
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });

  const api = () => request(t.http);

  /** Vaga já pontuada (scoredVersion 1), a não ser que se peça outra coisa. */
  async function job(data: Partial<Prisma.JobCreateInput> = {}) {
    n += 1;
    return t.prisma.job.create({
      data: { source: 'manual', title: `Vaga ${n}`, company: 'Acme', scoredVersion: 1, ...data },
    });
  }

  async function apply(jobId: string) {
    await t.prisma.application.create({
      data: {
        jobId,
        status: 'applied',
        appliedAt: new Date(),
        events: { create: { status: 'applied', occurredAt: new Date() } },
      },
    });
  }

  it('faixas nas bordas, na mesma ordem de scoreTier', async () => {
    await job({ score: 800 });
    await job({ score: 799 });
    await job({ score: 600 });
    await job({ score: 599 });
    await job({ score: 0, incompatible: true });
    await job({ score: null });
    await job({ score: 950, scoredVersion: null }); // nota antiga, na fila
    await job({ score: 900, triage: 'saved' });
    await job({ score: 900, triage: 'dismissed' }); // fora das faixas

    const counts = (await api().get('/api/jobs/counts').expect(200)).body as JobCountsDto;
    expect(counts).toEqual({
      triage: { inbox: 7, saved: 1, dismissed: 1 },
      withApplication: 0,
      score: { great: 2, good: 2, weak: 1, incompatible: 1, pending: 1, unscored: 1 },
      swipeable: 6,
      inboxClosed: 0,
    });
  });

  it('encerradas da caixa: contadas à parte e fora do Deslizar', async () => {
    const day = 24 * 60 * 60 * 1000;
    await job({ score: 900 });
    await job({ score: 900, closedAt: new Date() });
    await job({ score: 900, deadline: new Date(Date.now() - day) });
    await job({ score: 900, deadline: new Date(Date.now() + day) });
    await job({ score: 900, triage: 'saved', closedAt: new Date() }); // salva: não entra

    const counts = (await api().get('/api/jobs/counts').expect(200)).body as JobCountsDto;
    expect(counts).toMatchObject({ triage: { inbox: 4 }, swipeable: 2, inboxClosed: 2 });
  });

  it('com candidatura (aplicada, em processo, "Desisti") sai da caixa e do Deslizar', async () => {
    await job({ title: 'Por olhar', score: 900 });
    const applied = await job({ title: 'Aplicada', score: 900 });
    await apply(applied.id);
    const withdrawn = await job({ title: 'Desisti', score: 900, closedAt: new Date() });
    await apply(withdrawn.id);
    await job({ title: 'Descartada', score: 900, triage: 'dismissed' });

    const counts = (await api().get('/api/jobs/counts').expect(200)).body as JobCountsDto;
    expect(counts).toMatchObject({
      triage: { inbox: 1, saved: 0, dismissed: 1 },
      withApplication: 2,
      swipeable: 1,
      inboxClosed: 0,
      score: { great: 1 },
    });

    // O que a tela pede para a aba Caixa e para o Deslizar.
    const inbox = (
      await api().get('/api/jobs?triage=inbox&hasApplication=false&hideClosed=true').expect(200)
    ).body.items as JobDto[];
    expect(inbox.map((item) => item.title)).toEqual(['Por olhar']);
  });

  it('nota de preferências antigas conta como pendente, na contagem e na vaga', async () => {
    await t.prisma.preferences.create({ data: { id: 1, version: 3 } });
    await job({ title: 'Atual', score: 900, scoredVersion: 3 });
    await job({ title: 'Antiga', score: 900, scoredVersion: 2 });
    await job({ title: 'Nunca', score: null, scoredVersion: null });

    const counts = (await api().get('/api/jobs/counts').expect(200)).body as JobCountsDto;
    expect(counts.score).toMatchObject({ great: 1, pending: 2 });

    const items = (await api().get('/api/jobs?sort=recent').expect(200)).body.items as JobDto[];
    const pending = Object.fromEntries(items.map((item) => [item.title, item.scorePending]));
    expect(pending).toEqual({ Atual: false, Antiga: true, Nunca: true });

    // Detalhe e triagem respondem com a mesma regra.
    const antiga = items.find((item) => item.title === 'Antiga')!;
    expect((await api().get(`/api/jobs/${antiga.id}`).expect(200)).body.scorePending).toBe(true);
    const triaged = await api()
      .put(`/api/jobs/${antiga.id}/triage`)
      .send({ status: 'saved' })
      .expect(200);
    expect(triaged.body.scorePending).toBe(true);
  });

  it('sem vagas, tudo zero', async () => {
    const counts = (await api().get('/api/jobs/counts').expect(200)).body as JobCountsDto;
    expect(counts.triage).toEqual({ inbox: 0, saved: 0, dismissed: 0 });
    expect(Object.values(counts.score).every((value) => value === 0)).toBe(true);
  });

  it('hasApplication: com candidatura aparece em qualquer triagem; false esconde', async () => {
    const saved = await job({ title: 'Salva com candidatura', triage: 'saved' });
    const inbox = await job({ title: 'Caixa com candidatura' });
    await job({ title: 'Sem candidatura' });
    await apply(saved.id);
    await apply(inbox.id);

    const titles = async (query: string) =>
      ((await api().get(`/api/jobs?${query}`).expect(200)).body.items as JobDto[])
        .map((item) => item.title)
        .sort();

    expect(await titles('hasApplication=true')).toEqual([
      'Caixa com candidatura',
      'Salva com candidatura',
    ]);
    expect(await titles('hasApplication=true&triage=saved')).toEqual(['Salva com candidatura']);
    expect(await titles('hasApplication=false')).toEqual(['Sem candidatura']);

    const counts = (await api().get('/api/jobs/counts').expect(200)).body as JobCountsDto;
    expect(counts.withApplication).toBe(2);
  });

  it('hasApplication inválido é 400', async () => {
    await api().get('/api/jobs?hasApplication=talvez').expect(400);
  });
});
