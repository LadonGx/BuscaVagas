import type { ApplicationDetailDto, InterviewQuestionDto, JobDto } from '@busca-vagas/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestApp, describeDb, resetDatabase, type TestApp } from '../../../test/helpers';
import { ApplicationsModule } from '../applications/applications.module';
import { JobsModule } from '../jobs/jobs.module';
import { INTERVIEW_SEEDS } from './interview-seeds';
import { InterviewsModule } from './interviews.module';
import { InterviewsService } from './interviews.service';

describeDb('Perguntas de entrevista (integração)', () => {
  let t: TestApp;
  let service: InterviewsService;
  let n = 0;

  beforeAll(async () => {
    t = await createTestApp([JobsModule, ApplicationsModule, InterviewsModule]);
    service = t.app.get(InterviewsService);
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });

  const api = () => request(t.http);

  async function create(body: Record<string, unknown>): Promise<InterviewQuestionDto> {
    return (await api().post('/api/interview-questions').send(body).expect(201))
      .body as InterviewQuestionDto;
  }

  async function apply(company = 'Acme'): Promise<ApplicationDetailDto> {
    n += 1;
    const job = (
      await api()
        .post('/api/jobs')
        .send({ title: `Dev ${n}`, company })
        .expect(201)
    ).body as JobDto;
    return (await api().post('/api/applications').send({ jobId: job.id }).expect(201))
      .body as ApplicationDetailDto;
  }

  it('lista inicial entra uma vez só, na ordem, sem resposta', async () => {
    expect(await service.seedOnce(INTERVIEW_SEEDS)).toBe(INTERVIEW_SEEDS.length);
    expect(INTERVIEW_SEEDS.length).toBeGreaterThanOrEqual(30);

    const list = (await api().get('/api/interview-questions').expect(200))
      .body as InterviewQuestionDto[];
    expect(list.map((item) => item.question)).toEqual(INTERVIEW_SEEDS.map((seed) => seed.question));
    expect(list.every((item) => item.seeded && !item.answered)).toBe(true);

    // Apagou todas: não voltam.
    await t.prisma.interviewQuestion.deleteMany();
    expect(await service.seedOnce(INTERVIEW_SEEDS)).toBeNull();
    expect(await t.prisma.interviewQuestion.count()).toBe(0);
  });

  it('cria com tags normalizadas, resposta e STAR; edita e limpa', async () => {
    const created = await create({
      question: 'Fale de um conflito no time.',
      category: 'behavioral',
      tags: ['Conflito ', 'conflito', 'Time'],
      starSituation: 'Dois devs discordavam do formato da API.',
      starResult: '',
    });
    expect(created).toMatchObject({
      category: 'behavioral',
      tags: ['conflito', 'time'],
      answer: null,
      starSituation: 'Dois devs discordavam do formato da API.',
      starResult: null,
      answered: true,
      seeded: false,
      practice: { count: 0, lastRating: null, practicedAt: null },
      asked: [],
    });

    const edited = (
      await api()
        .patch(`/api/interview-questions/${created.id}`)
        .send({ answer: 'Conversamos e fizemos um teste.', starSituation: null })
        .expect(200)
    ).body as InterviewQuestionDto;
    expect(edited).toMatchObject({
      answer: 'Conversamos e fizemos um teste.',
      starSituation: null,
      answered: true,
    });

    const cleared = (
      await api().patch(`/api/interview-questions/${created.id}`).send({ answer: '  ' }).expect(200)
    ).body as InterviewQuestionDto;
    expect(cleared.answered).toBe(false);
  });

  it('validação: pergunta curta, categoria errada, tags demais, PATCH vazio', async () => {
    const short = await api()
      .post('/api/interview-questions')
      .send({ question: 'a', category: 'hr' })
      .expect(400);
    expect(JSON.stringify(short.body)).toContain('Escreva a pergunta');
    await api()
      .post('/api/interview-questions')
      .send({ question: 'Pergunta?', category: 'outra' })
      .expect(400);
    await api()
      .post('/api/interview-questions')
      .send({
        question: 'Pergunta?',
        category: 'hr',
        tags: Array.from({ length: 11 }, (_, i) => `t${i}`),
      })
      .expect(400);
    const created = await create({ question: 'Pergunta?', category: 'hr' });
    await api().patch(`/api/interview-questions/${created.id}`).send({}).expect(400);
  });

  it('treino guarda a última avaliação e conta as vezes', async () => {
    const created = await create({ question: 'Explique REST.', category: 'technical' });
    await api()
      .post(`/api/interview-questions/${created.id}/practice`)
      .send({ rating: 'again' })
      .expect(200);
    const second = (
      await api()
        .post(`/api/interview-questions/${created.id}/practice`)
        .send({ rating: 'good' })
        .expect(200)
    ).body as InterviewQuestionDto;
    expect(second.practice).toMatchObject({ count: 2, lastRating: 'good' });
    expect(second.practice.practicedAt).not.toBeNull();
    await api()
      .post(`/api/interview-questions/${created.id}/practice`)
      .send({ rating: 'meh' })
      .expect(400);
  });

  it('"caiu nesta entrevista": marca, anota, lista as candidaturas e desmarca', async () => {
    const question = await create({ question: 'Por que aqui?', category: 'hr' });
    const first = await apply('Acme');
    const second = await apply('Beta');

    await api()
      .put(`/api/interview-questions/${question.id}/asked/${first.id}`)
      .send({})
      .expect(200);
    const marked = (
      await api()
        .put(`/api/interview-questions/${question.id}/asked/${second.id}`)
        .send({ note: 'Travei no exemplo' })
        .expect(200)
    ).body as InterviewQuestionDto;
    expect(marked.asked.map((item) => [item.company, item.note])).toEqual([
      ['Beta', 'Travei no exemplo'],
      ['Acme', null],
    ]);

    // De novo: atualiza a anotação, sem duplicar.
    const again = (
      await api()
        .put(`/api/interview-questions/${question.id}/asked/${first.id}`)
        .send({ note: 'Fui bem' })
        .expect(200)
    ).body as InterviewQuestionDto;
    expect(again.asked).toHaveLength(2);
    expect(again.asked.find((item) => item.applicationId === first.id)?.note).toBe('Fui bem');

    const removed = (
      await api()
        .delete(`/api/interview-questions/${question.id}/asked/${second.id}`)
        .set('Content-Type', 'application/json')
        .expect(200)
    ).body as InterviewQuestionDto;
    expect(removed.asked.map((item) => item.company)).toEqual(['Acme']);

    await api()
      .put(`/api/interview-questions/${question.id}/asked/nao-existe`)
      .send({})
      .expect(404);
  });

  it('pergunta nova já marcada numa candidatura; apagar a candidatura tira a marca', async () => {
    const application = await apply();
    const created = await create({
      question: 'Como funciona o event loop?',
      category: 'technical',
      askedIn: application.id,
    });
    expect(created.asked).toMatchObject([{ applicationId: application.id, company: 'Acme' }]);

    await api()
      .delete(`/api/applications/${application.id}`)
      .set('Content-Type', 'application/json')
      .expect(204);
    const after = (await api().get(`/api/interview-questions/${created.id}`).expect(200))
      .body as InterviewQuestionDto;
    expect(after.asked).toEqual([]);

    await api()
      .post('/api/interview-questions')
      .send({ question: 'Pergunta?', category: 'hr', askedIn: 'nao-existe' })
      .expect(404);
  });

  it('apagar a pergunta leva as marcas; 404 para inexistente', async () => {
    const application = await apply();
    const created = await create({
      question: 'Pergunta?',
      category: 'hr',
      askedIn: application.id,
    });
    await api()
      .delete(`/api/interview-questions/${created.id}`)
      .set('Content-Type', 'application/json')
      .expect(204);
    expect(await t.prisma.interviewAsked.count()).toBe(0);
    await api().get(`/api/interview-questions/${created.id}`).expect(404);
    await api()
      .delete(`/api/interview-questions/${created.id}`)
      .set('Content-Type', 'application/json')
      .expect(404);
  });
});
