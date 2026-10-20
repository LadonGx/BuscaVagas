import type { NotificationSettingsDto, NotificationsDto } from '@busca-vagas/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestApp, describeDb, resetDatabase, type TestApp } from '../../../test/helpers';
import type { Prisma } from '../../generated/prisma/client';
import { NotificationsModule } from './notifications.module';
import { NotificationsService } from './notifications.service';

const HOUR = 60 * 60 * 1000;
const NOW = new Date();
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describeDb('Avisos de nota alta (integração)', () => {
  let t: TestApp;
  let service: NotificationsService;
  let n = 0;

  beforeAll(async () => {
    t = await createTestApp([NotificationsModule]);
    service = t.app.get(NotificationsService);
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });

  const api = () => request(t.http);

  /** Vaga nova, já pontuada com as preferências atuais (versão 0). */
  async function job(title: string, data: Partial<Prisma.JobCreateInput> = {}) {
    n += 1;
    return t.prisma.job.create({
      data: {
        source: 'manual',
        title,
        company: `Empresa ${n}`,
        score: 900,
        scoredVersion: 0,
        firstSeenAt: ago(HOUR),
        ...data,
      },
    });
  }

  it('junta as novas de nota alta num aviso só, uma vez por vaga', async () => {
    await job('Ótima', { score: 950 });
    await job('Boa', { score: 820 });
    await job('Abaixo', { score: 799 });
    await job('Incompatível', { incompatible: true });
    await job('Antiga', { firstSeenAt: ago(49 * HOUR) });
    await job('Salva', { triage: 'saved' });
    await job('Encerrada', { closedAt: ago(HOUR) });
    await job('Prazo vencido', { deadline: ago(HOUR) });
    await job('Nota na fila', { scoredVersion: null });

    const first = await service.collect(NOW);
    expect(first?.minScore).toBe(800);
    expect(first?.jobs.map((item) => item.title)).toEqual(['Ótima', 'Boa']);

    // De novo: nada novo, nenhum aviso repetido.
    expect(await service.collect(NOW)).toBeNull();

    await job('Chegou depois', { score: 870 });
    expect((await service.collect(NOW))?.jobs.map((item) => item.title)).toEqual(['Chegou depois']);
  });

  it('nota de preferências antigas espera o recálculo', async () => {
    await t.prisma.preferences.create({ data: { id: 1, version: 2 } });
    await job('Versão velha', { scoredVersion: 1 });
    expect(await service.collect(NOW)).toBeNull();
    await job('Versão atual', { scoredVersion: 2 });
    expect((await service.collect(NOW))?.jobs.map((item) => item.title)).toEqual(['Versão atual']);
  });

  it('GET /notifications: não lidos e lista; POST /read marca tudo', async () => {
    await job('A');
    await service.collect(ago(2 * HOUR));
    await job('B');
    await service.collect(NOW);

    const list = (await api().get('/api/notifications').expect(200)).body as NotificationsDto;
    expect(list.unread).toBe(2);
    expect(list.items.map((item) => item.jobs.map((j) => j.title))).toEqual([['B'], ['A']]);
    expect(list.items[0]).toMatchObject({ kind: 'high-score', readAt: null });

    const read = (
      await api()
        .post('/api/notifications/read')
        .set('Content-Type', 'application/json')
        .expect(200)
    ).body as NotificationsDto;
    expect(read.unread).toBe(0);
    expect(read.items.every((item) => item.readAt !== null)).toBe(true);
  });

  it('a vaga mostra como está agora: triada, encerrada ou apagada', async () => {
    const triaged = await job('Triada');
    const closed = await job('Fechou depois');
    const deleted = await job('Apagada');
    await service.collect(NOW);
    await t.prisma.job.update({ where: { id: triaged.id }, data: { triage: 'dismissed' } });
    await t.prisma.job.update({ where: { id: closed.id }, data: { closedAt: NOW } });
    await t.prisma.job.delete({ where: { id: deleted.id } });

    const [item] = ((await api().get('/api/notifications').expect(200)).body as NotificationsDto)
      .items;
    expect(item!.jobs.map((j) => [j.title, j.triage, j.closed])).toEqual(
      expect.arrayContaining([
        ['Triada', 'dismissed', false],
        ['Fechou depois', 'inbox', true],
      ]),
    );
    expect(item!.jobs).toHaveLength(2);
  });

  it('configuração: padrão 800, ajustável, 0 desliga; inválido = 400', async () => {
    expect((await api().get('/api/notifications/settings').expect(200)).body).toEqual({
      minScore: 800,
    });
    const saved = (
      await api().put('/api/notifications/settings').send({ minScore: 900 }).expect(200)
    ).body as NotificationSettingsDto;
    expect(saved.minScore).toBe(900);

    await job('850', { score: 850 });
    expect(await service.collect(NOW)).toBeNull();

    await api().put('/api/notifications/settings').send({ minScore: 0 }).expect(200);
    await job('1000', { score: 1000 });
    expect(await service.collect(NOW)).toBeNull();

    await api().put('/api/notifications/settings').send({ minScore: 1001 }).expect(400);
    await api().put('/api/notifications/settings').send({ minScore: 'alta' }).expect(400);
  });

  it('avisos com mais de 30 dias somem', async () => {
    await t.prisma.notification.create({ data: { minScore: 800, createdAt: ago(31 * 24 * HOUR) } });
    await t.prisma.notification.create({ data: { minScore: 800, createdAt: ago(2 * 24 * HOUR) } });
    await service.collect(NOW);
    expect(await t.prisma.notification.count()).toBe(1);
  });
});
