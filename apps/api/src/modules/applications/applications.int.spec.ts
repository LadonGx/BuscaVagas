import type { ApplicationDetailDto, ApplicationDto, JobDto } from '@busca-vagas/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestApp, describeDb, resetDatabase, type TestApp } from '../../../test/helpers';
import { JobsModule } from '../jobs/jobs.module';
import { ApplicationsModule } from './applications.module';

describeDb('Candidaturas (integração)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp([JobsModule, ApplicationsModule]);
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });

  const api = () => request(t.http);

  async function createJob(title = 'Dev Júnior', company = 'Acme'): Promise<JobDto> {
    return (await api().post('/api/jobs').send({ title, company }).expect(201)).body as JobDto;
  }

  async function apply(
    jobId: string,
    body: Record<string, unknown> = {},
  ): Promise<ApplicationDetailDto> {
    return (
      await api()
        .post('/api/applications')
        .send({ jobId, ...body })
        .expect(201)
    ).body as ApplicationDetailDto;
  }

  it('cria a candidatura com o 1º evento e marca a vaga como salva', async () => {
    const job = await createJob();
    await api().put(`/api/jobs/${job.id}/triage`).send({ status: 'dismissed' }).expect(200);

    const app = await apply(job.id, {
      occurredAt: '2026-10-01T10:00:00-03:00',
      appliedVia: 'Gupy',
      salaryExpectation: 4000,
    });

    expect(app).toMatchObject({
      status: 'applied',
      appliedAt: '2026-10-01T13:00:00.000Z',
      appliedVia: 'Gupy',
      salaryExpectation: 4000,
      job: { id: job.id, title: 'Dev Júnior', company: 'Acme' },
    });
    expect(app.events).toHaveLength(1);
    expect(app.events[0]).toMatchObject({ status: 'applied', previousStatus: null });

    const after = (await api().get(`/api/jobs/${job.id}`).expect(200)).body as JobDto;
    expect(after).toMatchObject({
      triage: 'saved',
      dismissReason: null,
      application: { id: app.id, status: 'applied' },
    });
  });

  it('segunda candidatura para a mesma vaga -> 409; vaga inexistente -> 404', async () => {
    const job = await createJob();
    const first = await apply(job.id);

    const dup = await api().post('/api/applications').send({ jobId: job.id }).expect(409);
    expect(dup.body.existingApplicationId).toBe(first.id);

    await api().post('/api/applications').send({ jobId: 'nao-existe' }).expect(404);
  });

  it('evento retroativo não muda o status atual; o mais recente manda', async () => {
    const job = await createJob();
    const app = await apply(job.id, { occurredAt: '2026-10-01' });

    await api()
      .post(`/api/applications/${app.id}/events`)
      .send({ status: 'rejected', occurredAt: '2026-10-08', note: 'e-mail padrão' })
      .expect(201);

    // Registrado depois, mas aconteceu antes da recusa.
    const detail = (
      await api()
        .post(`/api/applications/${app.id}/events`)
        .send({ status: 'in_process', occurredAt: '2026-10-04', note: 'entrevista RH' })
        .expect(201)
    ).body as ApplicationDetailDto;

    expect(detail.status).toBe('rejected');
    expect(detail.events.map((e) => [e.previousStatus, e.status, e.note])).toEqual([
      [null, 'applied', null],
      ['applied', 'in_process', 'entrevista RH'],
      ['in_process', 'rejected', 'e-mail padrão'],
    ]);
  });

  it('transições livres: reabrir uma recusada e repetir "em processo"', async () => {
    const job = await createJob();
    const app = await apply(job.id, { occurredAt: '2026-09-01' });

    for (const [status, day] of [
      ['in_process', '2026-09-05'],
      ['rejected', '2026-09-10'],
      ['in_process', '2026-09-20'],
      ['in_process', '2026-09-25'],
    ] as const) {
      await api()
        .post(`/api/applications/${app.id}/events`)
        .send({ status, occurredAt: day })
        .expect(201);
    }

    const detail = (await api().get(`/api/applications/${app.id}`).expect(200))
      .body as ApplicationDetailDto;
    expect(detail.status).toBe('in_process');
    expect(detail.events).toHaveLength(5);
  });

  it('corrigir e apagar evento recalculam status e appliedAt', async () => {
    const job = await createJob();
    const app = await apply(job.id, { occurredAt: '2026-10-02' });

    const withOffer = (
      await api()
        .post(`/api/applications/${app.id}/events`)
        .send({ status: 'offer', occurredAt: '2026-10-07' })
        .expect(201)
    ).body as ApplicationDetailDto;
    const offerEvent = withOffer.events.find((e) => e.status === 'offer')!;
    const firstEvent = withOffer.events[0]!;

    // Corrige a data do primeiro evento: appliedAt acompanha.
    const fixed = (
      await api()
        .patch(`/api/applications/${app.id}/events/${firstEvent.id}`)
        .send({ occurredAt: '2026-09-30' })
        .expect(200)
    ).body as ApplicationDetailDto;
    expect(fixed.appliedAt).toBe('2026-09-30T00:00:00.000Z');

    // Apaga a proposta: o status volta para applied.
    const removed = (
      await api().delete(`/api/applications/${app.id}/events/${offerEvent.id}`).expect(200)
    ).body as ApplicationDetailDto;
    expect(removed.status).toBe('applied');

    // O último evento não pode ser apagado.
    await api().delete(`/api/applications/${app.id}/events/${firstEvent.id}`).expect(409);
  });

  it('evento de outra candidatura -> 404', async () => {
    const a = await apply((await createJob('A')).id);
    const b = await apply((await createJob('B')).id);

    await api()
      .patch(`/api/applications/${a.id}/events/${b.events[0]!.id}`)
      .send({ note: 'x' })
      .expect(404);
  });

  it('data de evento no futuro -> 400', async () => {
    const app = await apply((await createJob()).id);
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const response = await api()
      .post(`/api/applications/${app.id}/events`)
      .send({ status: 'in_process', occurredAt: future })
      .expect(400);
    expect(response.body.issues[0].path).toBe('occurredAt');
  });

  it('PATCH atualiza próxima etapa e limpa campos com null', async () => {
    const app = await apply((await createJob()).id, { notes: 'contato: Ana' });

    const updated = (
      await api()
        .patch(`/api/applications/${app.id}`)
        .send({
          nextStepAt: '2026-10-15T14:00:00-03:00',
          nextStepNote: 'Entrevista técnica',
          notes: null,
        })
        .expect(200)
    ).body as ApplicationDetailDto;

    expect(updated).toMatchObject({
      nextStepAt: '2026-10-15T17:00:00.000Z',
      nextStepNote: 'Entrevista técnica',
      notes: null,
      status: 'applied',
    });
  });

  it('lista com filtros por status e texto, e resumo por status', async () => {
    const a = await apply((await createJob('Backend', 'Alpha')).id);
    await apply((await createJob('Frontend', 'Beta')).id);
    const c = await apply((await createJob('Full Stack', 'Gama')).id);

    await api().post(`/api/applications/${a.id}/events`).send({ status: 'in_process' }).expect(201);
    await api().post(`/api/applications/${c.id}/events`).send({ status: 'rejected' }).expect(201);

    const titles = async (query: string) =>
      ((await api().get(`/api/applications?${query}`).expect(200)).body.items as ApplicationDto[])
        .map((app) => app.job.title)
        .sort();

    expect(await titles('status=in_process,rejected')).toEqual(['Backend', 'Full Stack']);
    expect(await titles('q=beta')).toEqual(['Frontend']);

    const summary = (await api().get('/api/applications/summary').expect(200)).body;
    expect(summary).toEqual({
      applied: 1,
      in_process: 1,
      offer: 0,
      rejected: 1,
      withdrawn: 0,
      total: 3,
    });
  });

  it('lista ordena pela última atualização e pagina por cursor', async () => {
    const first = await apply((await createJob('Primeira')).id);
    await apply((await createJob('Segunda')).id);
    await apply((await createJob('Terceira')).id);

    // Mexer na primeira a traz para o topo.
    await api()
      .post(`/api/applications/${first.id}/events`)
      .send({ status: 'in_process' })
      .expect(201);

    const page1 = (await api().get('/api/applications?limit=2').expect(200)).body;
    expect(page1.items.map((app: ApplicationDto) => app.job.title)).toEqual([
      'Primeira',
      'Terceira',
    ]);

    const page2 = (
      await api().get(`/api/applications?limit=2&cursor=${page1.nextCursor}`).expect(200)
    ).body;
    expect(page2.items.map((app: ApplicationDto) => app.job.title)).toEqual(['Segunda']);
    expect(page2.nextCursor).toBeNull();
  });

  it('vaga com candidatura não pode ser apagada nem descartada; sem candidatura, pode', async () => {
    const job = await createJob();
    const app = await apply(job.id);

    await api().delete(`/api/jobs/${job.id}`).expect(409);
    await api().put(`/api/jobs/${job.id}/triage`).send({ status: 'dismissed' }).expect(409);

    const other = await createJob('Outra');
    const bulk = await api()
      .post('/api/jobs/triage')
      .send({ ids: [job.id, other.id], status: 'dismissed' })
      .expect(200);
    expect(bulk.body).toEqual({ updated: 1, skipped: [job.id] });

    // Apagar a candidatura leva o histórico junto e libera a vaga.
    await api().delete(`/api/applications/${app.id}`).expect(204);
    expect(await t.prisma.statusEvent.count()).toBe(0);
    const jobAfter = (await api().get(`/api/jobs/${job.id}`).expect(200)).body as JobDto;
    expect(jobAfter).toMatchObject({ triage: 'saved', application: null });
    await api().delete(`/api/jobs/${job.id}`).expect(204);
  });
});
