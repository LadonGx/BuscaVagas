import { Module } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createTestApp, describeDb, resetDatabase, type TestApp } from '../../../test/helpers';
import { SCORE_REQUESTER } from '../scoring/scoring.constants';
import { RecencyRefreshService } from './recency-refresh.service';

const requester = { request: vi.fn(() => Promise.resolve(true)) };

@Module({
  providers: [RecencyRefreshService, { provide: SCORE_REQUESTER, useValue: requester }],
})
class RecencyTestModule {}

const TZ = 'America/Sao_Paulo';
// 19/10/2026 10:00 em São Paulo (UTC-3): "hoje" começa às 03:00 UTC.
const NOW = new Date('2026-10-19T13:00:00.000Z');

describeDb('Idade das vagas na nota (integração)', () => {
  let t: TestApp;
  let recency: RecencyRefreshService;

  beforeAll(async () => {
    t = await createTestApp([RecencyTestModule]);
    recency = t.app.get(RecencyRefreshService);
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    requester.request.mockClear();
  });

  async function job(title: string, data: Record<string, unknown>) {
    return t.prisma.job.create({
      data: { source: 'manual', title, company: 'Acme', scoredVersion: 1, ...data },
    });
  }

  it('com maxAgeDays: as não descartadas pontuadas antes de hoje voltam para a fila', async () => {
    await t.prisma.preferences.create({ data: { id: 1, maxAgeDays: 30, version: 1 } });
    const yesterday = await job('ontem', { scoredAt: new Date('2026-10-19T02:59:59.000Z') });
    const today = await job('hoje', { scoredAt: new Date('2026-10-19T03:00:00.000Z') });
    const dismissed = await job('descartada', {
      triage: 'dismissed',
      scoredAt: new Date('2026-10-10T12:00:00.000Z'),
    });
    const before = await t.prisma.job.findUniqueOrThrow({ where: { id: yesterday.id } });

    expect(await recency.run(NOW, TZ)).toEqual({ invalidated: 1 });
    const version = async (id: string) =>
      (await t.prisma.job.findUniqueOrThrow({ where: { id } })).scoredVersion;
    expect(await version(yesterday.id)).toBeNull();
    expect(await version(today.id)).toBe(1);
    expect(await version(dismissed.id)).toBe(1);
    expect(requester.request).toHaveBeenCalledWith('recency');
    // Não é edição da vaga.
    expect(
      (await t.prisma.job.findUniqueOrThrow({ where: { id: yesterday.id } })).updatedAt,
    ).toEqual(before.updatedAt);

    // Segunda rodada no mesmo dia: nada a fazer, nem pedido à fila.
    requester.request.mockClear();
    expect(await recency.run(NOW, TZ)).toEqual({ invalidated: 0 });
    expect(requester.request).not.toHaveBeenCalled();
  });

  it('sem maxAgeDays a idade não entra na nota: nada muda', async () => {
    await t.prisma.preferences.create({ data: { id: 1, maxAgeDays: null, version: 1 } });
    await job('antiga', { scoredAt: new Date('2026-10-01T12:00:00.000Z') });

    expect(await recency.run(NOW, TZ)).toEqual({ invalidated: 0 });
    expect(await t.prisma.job.count({ where: { scoredVersion: null } })).toBe(0);
    expect(requester.request).not.toHaveBeenCalled();
  });
});
