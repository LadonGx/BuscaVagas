import type { JobDto, JobPosting, Page } from '@busca-vagas/shared';
import { HttpError, type HttpClient } from '@busca-vagas/sources';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createTestApp, describeDb, resetDatabase, type TestApp } from '../../../test/helpers';
import { AVAILABILITY_HTTP, AvailabilityService } from './availability.service';
import { JobsModule } from './jobs.module';
import { JobsService } from './jobs.service';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date();
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

const posting = (n: number, extra: Partial<JobPosting> = {}): JobPosting => ({
  source: 'greenhouse',
  externalId: String(n),
  url: `https://job-boards.greenhouse.io/acme/jobs/${n}`,
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
  board: 'acme',
  ...extra,
});

const ok = (slug: string, externalIds: string[]) => ({
  slug,
  status: 'ok' as const,
  jobs: externalIds.length,
  kept: 0,
  error: null,
  externalIds,
});

describeDb('Disponibilidade (integração)', () => {
  let t: TestApp;
  let jobs: JobsService;
  let availability: AvailabilityService;
  let http: HttpClient;

  beforeAll(async () => {
    t = await createTestApp([JobsModule]);
    jobs = t.app.get(JobsService);
    availability = t.app.get(AvailabilityService);
    http = t.app.get<HttpClient>(AVAILABILITY_HTTP);
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    vi.restoreAllMocks();
  });

  const api = () => request(t.http);
  const byExternal = (n: number) =>
    t.prisma.job.findFirstOrThrow({ where: { externalId: String(n) } });
  const list = async (query: string) =>
    ((await api().get(`/api/jobs?${query}`).expect(200)).body as Page<JobDto>).items
      .map((job) => job.title)
      .sort();

  it('guarda o board e o prazo na entrada', async () => {
    await jobs.ingest([posting(1, { deadline: '2026-12-08T00:00:00.000Z' })]);
    const job = await byExternal(1);
    expect(job.board).toBe('acme');
    expect(job.deadline?.toISOString()).toBe('2026-12-08T00:00:00.000Z');
  });

  it('busca no board: fecha as que saíram, só da empresa lida com sucesso, e reabre as que voltam', async () => {
    await jobs.ingest([
      posting(1),
      posting(2),
      posting(3, { board: 'outra', url: 'https://job-boards.greenhouse.io/outra/jobs/3' }),
      posting(4, { source: 'lever', url: 'https://jobs.lever.co/acme/4' }),
    ]);

    const first = await availability.recordBoardScan('greenhouse', [
      ok('acme', ['1']),
      { slug: 'outra', status: 'failed', jobs: 0, kept: 0, error: 'HTTP 500' },
    ]);
    expect(first).toEqual({ closed: 1, reopened: 0 });
    expect((await byExternal(2)).closedReason).toBe('Saiu do board da empresa');
    expect((await byExternal(1)).closedAt).toBeNull();
    expect((await byExternal(3)).closedAt).toBeNull(); // empresa com falha: não mexe
    expect((await byExternal(4)).closedAt).toBeNull(); // outra fonte

    const dto = (
      await api()
        .get(`/api/jobs/${(await byExternal(2)).id}`)
        .expect(200)
    ).body as JobDto;
    expect(dto.availability).toMatchObject({ state: 'closed', reason: 'Saiu do board da empresa' });

    expect(await availability.recordBoardScan('greenhouse', [ok('acme', ['1', '2'])])).toEqual({
      closed: 0,
      reopened: 1,
    });
    expect((await byExternal(2)).closedAt).toBeNull();
  });

  it('vaga vista de novo numa busca reabre', async () => {
    await jobs.ingest([posting(1)]);
    const job = await byExternal(1);
    await t.prisma.job.update({
      where: { id: job.id },
      data: { closedAt: ago(1), closedReason: 'Saiu do board da empresa' },
    });

    await jobs.ingest([posting(1)]);
    expect((await byExternal(1)).closedAt).toBeNull();
  });

  it('prazo vencido conta como encerrada, com a data no motivo', async () => {
    await jobs.ingest([posting(1, { deadline: '2026-01-05T00:00:00.000Z' })]);
    const dto = (
      await api()
        .get(`/api/jobs/${(await byExternal(1)).id}`)
        .expect(200)
    ).body as JobDto;
    expect(dto.availability).toMatchObject({
      state: 'closed',
      reason: 'O prazo de inscrição terminou em 05/01/2026',
    });
  });

  it('esconder encerradas: some da caixa; salva e com candidatura ficam', async () => {
    await jobs.ingest([1, 2, 3, 4, 5].map((n) => posting(n)));
    const ids = await Promise.all([1, 2, 3, 4, 5].map(async (n) => (await byExternal(n)).id));
    await t.prisma.job.update({ where: { id: ids[1] }, data: { closedAt: ago(1) } });
    await t.prisma.job.update({ where: { id: ids[2] }, data: { deadline: ago(1) } });
    await t.prisma.job.update({
      where: { id: ids[3] },
      data: { closedAt: ago(1), triage: 'saved' },
    });
    await t.prisma.job.update({ where: { id: ids[4] }, data: { closedAt: ago(1) } });
    await t.prisma.application.create({
      data: { jobId: ids[4]!, status: 'applied', appliedAt: NOW },
    });

    expect(await list('hideClosed=true')).toEqual(['Vaga 1', 'Vaga 4', 'Vaga 5']);
    expect(await list('hideClosed=false')).toHaveLength(5);
  });

  it('POST /jobs/:id/check: Greenhouse 404 fecha, 200 reabre, erro de rede não mexe', async () => {
    await jobs.ingest([posting(1)]);
    const { id } = await byExternal(1);
    const getJson = vi.spyOn(http, 'getJson');

    getJson.mockRejectedValueOnce(new HttpError('HTTP 404', 'https://x', 404));
    let dto = (
      await api().post(`/api/jobs/${id}/check`).set('Content-Type', 'application/json').expect(200)
    ).body as JobDto;
    expect(getJson).toHaveBeenLastCalledWith(
      'https://boards-api.greenhouse.io/v1/boards/acme/jobs/1',
    );
    expect(dto.availability).toMatchObject({
      state: 'closed',
      reason: 'Saiu do board da empresa no Greenhouse',
    });
    expect(dto.availability.checkedAt).not.toBeNull();

    getJson.mockRejectedValueOnce(new Error('timeout'));
    dto = (
      await api().post(`/api/jobs/${id}/check`).set('Content-Type', 'application/json').expect(200)
    ).body as JobDto;
    expect(dto.availability.state).toBe('closed'); // continua: o sinal antigo vale
    expect((await byExternal(1)).checkState).toBe('unknown');

    getJson.mockResolvedValueOnce({ id: 1 });
    dto = (
      await api().post(`/api/jobs/${id}/check`).set('Content-Type', 'application/json').expect(200)
    ).body as JobDto;
    expect(dto.availability).toMatchObject({ state: 'open', closedAt: null });
  });

  it('POST /jobs/:id/check: site que proíbe acesso automático não é consultado', async () => {
    const created = (
      await api()
        .post('/api/jobs')
        .send({ title: 'Dev', company: 'Acme', url: 'https://www.linkedin.com/jobs/view/123' })
        .expect(201)
    ).body as JobDto;
    const getText = vi.spyOn(http, 'getText');

    const dto = (
      await api()
        .post(`/api/jobs/${created.id}/check`)
        .set('Content-Type', 'application/json')
        .expect(200)
    ).body as JobDto;
    expect(getText).not.toHaveBeenCalled();
    expect(dto.availability.state).toBe('unknown');
    expect(dto.availability.reason).toMatch(/não permite conferência automática/);
  });

  it('POST /jobs/:id/check em vaga inexistente: 404', async () => {
    await api()
      .post('/api/jobs/00000000-0000-0000-0000-000000000000/check')
      .set('Content-Type', 'application/json')
      .expect(404);
  });

  it('rodada diária: só salvas, sem candidatura, abertas e não conferidas há 20 h', async () => {
    await jobs.ingest([1, 2, 3, 4, 5].map((n) => posting(n)));
    const ids = await Promise.all([1, 2, 3, 4, 5].map(async (n) => (await byExternal(n)).id));
    // 1: salva, nunca conferida → confere (e fecha)
    // 2: salva, conferida há 2 h → pula
    // 3: salva, já encerrada → pula
    // 4: salva com candidatura → pula
    // 5: caixa → pula
    await t.prisma.job.updateMany({
      where: { id: { in: ids.slice(0, 4) } },
      data: { triage: 'saved' },
    });
    await t.prisma.job.update({
      where: { id: ids[1] },
      data: { checkedAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000) },
    });
    await t.prisma.job.update({ where: { id: ids[2] }, data: { closedAt: ago(3) } });
    await t.prisma.application.create({
      data: { jobId: ids[3]!, status: 'applied', appliedAt: NOW },
    });
    const getJson = vi
      .spyOn(http, 'getJson')
      .mockRejectedValue(new HttpError('HTTP 404', 'https://x', 404));

    expect(await availability.checkSaved({ pauseMs: 0, now: NOW })).toEqual({
      checked: 1,
      closed: 1,
    });
    expect(getJson).toHaveBeenCalledTimes(1);
    expect((await byExternal(1)).closedAt).not.toBeNull();

    // No dia seguinte, a 1 já está encerrada e não é conferida de novo.
    expect(await availability.checkSaved({ pauseMs: 0, now: NOW })).toEqual({
      checked: 0,
      closed: 0,
    });
  });
});
