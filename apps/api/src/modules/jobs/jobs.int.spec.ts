import type { JobDto, JobPosting } from '@busca-vagas/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestApp, describeDb, resetDatabase, type TestApp } from '../../../test/helpers';
import { JobsModule } from './jobs.module';
import { JobsService } from './jobs.service';

describeDb('Vagas (integração)', () => {
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

  async function createJob(body: Record<string, unknown>): Promise<JobDto> {
    const response = await api().post('/api/jobs').send(body).expect(201);
    return response.body as JobDto;
  }

  it('cria vaga manual com URL canônica e stack normalizada', async () => {
    const job = await createJob({
      title: 'Desenvolvedor Full Stack Júnior',
      company: 'Acme',
      url: 'https://Jobs.Acme.com/vaga/1/?utm_source=linkedin#apply',
      stack: ['TypeScript', 'nestjs', 'typescript'],
      workModel: 'hybrid',
      salaryMin: 3000,
      salaryMax: 4500,
      salaryCurrency: 'brl',
      postedAt: '2026-10-01',
    });

    expect(job).toMatchObject({
      source: 'manual',
      url: 'https://jobs.acme.com/vaga/1',
      stack: ['typescript', 'nestjs'],
      salaryCurrency: 'BRL',
      postedAt: '2026-10-01T00:00:00.000Z',
    });
  });

  it('URL repetida (mesmo com rastreamento diferente) responde 409 com o id existente', async () => {
    const first = await createJob({ title: 'Dev', company: 'Acme', url: 'https://acme.com/v/1' });

    const response = await api()
      .post('/api/jobs')
      .send({ title: 'Dev', company: 'Acme', url: 'https://acme.com/v/1?utm_medium=email' })
      .expect(409);

    expect(response.body.existingJobId).toBe(first.id);
  });

  it('várias vagas sem URL convivem', async () => {
    await createJob({ title: 'Indicação 1', company: 'A' });
    await createJob({ title: 'Indicação 2', company: 'B' });

    const list = await api().get('/api/jobs').expect(200);
    expect(list.body.items).toHaveLength(2);
  });

  it('validação devolve 400 com os campos', async () => {
    const response = await api()
      .post('/api/jobs')
      .send({ title: '', company: 'Acme', salaryMin: 5000, salaryMax: 1000 })
      .expect(400);

    const paths = response.body.issues.map((issue: { path: string }) => issue.path);
    expect(paths).toEqual(expect.arrayContaining(['title']));
  });

  it('filtra por texto, modalidade, stack e fonte', async () => {
    await createJob({
      title: 'Backend Node',
      company: 'Alpha',
      workModel: 'remote',
      stack: ['node'],
    });
    await createJob({
      title: 'Frontend React',
      company: 'Beta',
      workModel: 'onsite',
      stack: ['react'],
    });
    await createJob({
      title: 'Full Stack',
      company: 'Gama Node',
      workModel: 'hybrid',
      stack: ['node', 'react'],
    });

    const titles = async (query: string) =>
      (await api().get(`/api/jobs?${query}`).expect(200)).body.items
        .map((job: JobDto) => job.title)
        .sort();

    expect(await titles('q=node')).toEqual(['Backend Node', 'Full Stack']);
    expect(await titles('workModel=remote,hybrid')).toEqual(['Backend Node', 'Full Stack']);
    expect(await titles('stack=React')).toEqual(['Frontend React', 'Full Stack']);
    expect(await titles('source=gupy')).toEqual([]);
  });

  it('pagina por cursor sem pular nem repetir, mesmo apagando entre páginas', async () => {
    for (let i = 1; i <= 5; i += 1) {
      await createJob({ title: `Vaga ${i}`, company: 'Acme' });
    }

    const first = await api().get('/api/jobs?limit=2').expect(200);
    expect(first.body.items.map((job: JobDto) => job.title)).toEqual(['Vaga 5', 'Vaga 4']);

    // Apaga uma vaga já vista: com offset, a próxima página pularia uma.
    await api().delete(`/api/jobs/${first.body.items[0].id}`).expect(204);

    const second = await api().get(`/api/jobs?limit=2&cursor=${first.body.nextCursor}`).expect(200);
    expect(second.body.items.map((job: JobDto) => job.title)).toEqual(['Vaga 3', 'Vaga 2']);

    const third = await api().get(`/api/jobs?limit=2&cursor=${second.body.nextCursor}`).expect(200);
    expect(third.body.items.map((job: JobDto) => job.title)).toEqual(['Vaga 1']);
    expect(third.body.nextCursor).toBeNull();
  });

  it('cursor inválido responde 400', async () => {
    await api().get('/api/jobs?cursor=lixo').expect(400);
  });

  it('edita, limpa campo com null e barra URL de outra vaga', async () => {
    const a = await createJob({ title: 'A', company: 'X', url: 'https://x.com/a', location: 'SP' });
    await createJob({ title: 'B', company: 'X', url: 'https://x.com/b' });

    const updated = await api()
      .patch(`/api/jobs/${a.id}`)
      .send({ notes: 'falar com o Pedro', location: null })
      .expect(200);
    expect(updated.body).toMatchObject({ notes: 'falar com o Pedro', location: null, title: 'A' });

    await api().patch(`/api/jobs/${a.id}`).send({ url: 'https://x.com/b' }).expect(409);
  });

  it('PATCH valida a faixa salarial contra o valor já salvo', async () => {
    const job = await createJob({ title: 'A', company: 'X', salaryMin: 4000 });
    await api().patch(`/api/jobs/${job.id}`).send({ salaryMax: 3000 }).expect(400);
  });

  it('404 para vaga inexistente', async () => {
    await api().get('/api/jobs/nao-existe').expect(404);
    await api().patch('/api/jobs/nao-existe').send({ notes: 'x' }).expect(404);
    await api().delete('/api/jobs/nao-existe').expect(404);
  });

  it('ingest cria as novas, marca as existentes como vistas e não sobrescreve edição', async () => {
    const service = t.app.get(JobsService);
    const posting = (n: number, title = `Vaga ${n}`): JobPosting => ({
      source: 'gupy',
      externalId: String(n),
      url: `https://acme.gupy.io/jobs/${n}?utm_source=x`,
      title,
      company: 'Acme',
      description: null,
      location: null,
      workModel: 'remote',
      contractType: 'clt',
      seniority: 'junior',
      stack: ['Node'],
      salary: null,
      postedAt: null,
    });

    expect(await service.ingest([posting(1), posting(2), posting(2)])).toEqual({
      received: 3,
      created: 2,
      seen: 0,
      ignored: 0,
    });

    const [job1] = (await api().get('/api/jobs?q=Vaga 1').expect(200)).body.items as JobDto[];
    await api().patch(`/api/jobs/${job1!.id}`).send({ title: 'Título que eu corrigi' }).expect(200);

    const result = await service.ingest([posting(1, 'Título da fonte'), posting(3)]);
    expect(result).toEqual({ received: 2, created: 1, seen: 1, ignored: 0 });

    const after = (await api().get(`/api/jobs/${job1!.id}`).expect(200)).body as JobDto;
    expect(after.title).toBe('Título que eu corrigi');
    expect(new Date(after.lastSeenAt).getTime()).toBeGreaterThan(
      new Date(job1!.lastSeenAt).getTime(),
    );
  });

  it('recusa acesso por Host externo', async () => {
    await api().get('/api/jobs').set('Host', 'evil.com').expect(403);
  });
});
