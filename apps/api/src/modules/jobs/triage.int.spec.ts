import type { JobDto, JobPosting } from '@busca-vagas/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestApp, describeDb, resetDatabase, type TestApp } from '../../../test/helpers';
import { JobsModule } from './jobs.module';
import { JobsService } from './jobs.service';

describeDb('Triagem (integração)', () => {
  let t: TestApp;

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

  async function createJob(title: string, url?: string): Promise<JobDto> {
    return (await api().post('/api/jobs').send({ title, company: 'Acme', url }).expect(201))
      .body as JobDto;
  }

  const titles = async (query = '') =>
    ((await api().get(`/api/jobs?${query}`).expect(200)).body.items as JobDto[])
      .map((job) => job.title)
      .sort();

  it('vaga nova entra como inbox', async () => {
    const job = await createJob('Nova');
    expect(job).toMatchObject({ triage: 'inbox', triagedAt: null, dismissReason: null });
  });

  it('salvar e descartar com motivo; descartada some da listagem padrão', async () => {
    const a = await createJob('A');
    const b = await createJob('B');

    const saved = await api().put(`/api/jobs/${a.id}/triage`).send({ status: 'saved' }).expect(200);
    expect(saved.body.triage).toBe('saved');
    expect(saved.body.triagedAt).not.toBeNull();

    const dismissed = await api()
      .put(`/api/jobs/${b.id}/triage`)
      .send({ status: 'dismissed', reason: 'presencial' })
      .expect(200);
    expect(dismissed.body).toMatchObject({ triage: 'dismissed', dismissReason: 'presencial' });

    expect(await titles()).toEqual(['A']);
    expect(await titles('triage=dismissed')).toEqual(['B']);
    expect(await titles('triage=inbox,saved,dismissed')).toEqual(['A', 'B']);
  });

  it('desfazer volta para inbox e limpa data e motivo', async () => {
    const job = await createJob('A');
    await api()
      .put(`/api/jobs/${job.id}/triage`)
      .send({ status: 'dismissed', reason: 'salário' })
      .expect(200);

    const undone = await api()
      .put(`/api/jobs/${job.id}/triage`)
      .send({ status: 'inbox' })
      .expect(200);
    expect(undone.body).toMatchObject({ triage: 'inbox', triagedAt: null, dismissReason: null });
  });

  it('motivo só vale para descartadas', async () => {
    const job = await createJob('A');
    const saved = await api()
      .put(`/api/jobs/${job.id}/triage`)
      .send({ status: 'saved', reason: 'ignorado' })
      .expect(200);
    expect(saved.body.dismissReason).toBeNull();
  });

  it('status inválido -> 400; vaga inexistente -> 404', async () => {
    const job = await createJob('A');
    await api().put(`/api/jobs/${job.id}/triage`).send({ status: 'archived' }).expect(400);
    await api().put('/api/jobs/nao-existe/triage').send({ status: 'saved' }).expect(404);
  });

  it('lote atualiza as existentes e devolve as ignoradas', async () => {
    const a = await createJob('A');
    const b = await createJob('B');
    await createJob('C');

    const result = await api()
      .post('/api/jobs/triage')
      .send({ ids: [a.id, b.id, a.id, 'nao-existe'], status: 'dismissed', reason: 'empresa' })
      .expect(200);

    expect(result.body).toEqual({ updated: 2, skipped: ['nao-existe'] });
    expect(await titles()).toEqual(['C']);
  });

  it('a fonte trazer de novo uma vaga descartada não a ressuscita', async () => {
    const job = await createJob('Descartada', 'https://acme.gupy.io/jobs/9');
    await api().put(`/api/jobs/${job.id}/triage`).send({ status: 'dismissed' }).expect(200);

    const posting: JobPosting = {
      source: 'gupy',
      externalId: '9',
      url: 'https://acme.gupy.io/jobs/9?utm_source=feed',
      title: 'Descartada',
      company: 'Acme',
      description: null,
      location: null,
      workModel: null,
      contractType: null,
      seniority: null,
      stack: [],
      salary: null,
      postedAt: null,
    };
    const result = await t.app.get(JobsService).ingest([posting]);

    expect(result).toMatchObject({ created: 0, seen: 1 });
    expect(await titles()).toEqual([]);
  });
});
