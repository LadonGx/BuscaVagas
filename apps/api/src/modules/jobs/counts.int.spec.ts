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
    });
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
