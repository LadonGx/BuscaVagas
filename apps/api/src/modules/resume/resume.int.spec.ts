import type { ResumeDto, ResumeItemDto, ResumeSectionDto } from '@busca-vagas/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestApp, describeDb, resetDatabase, type TestApp } from '../../../test/helpers';
import { DEFAULT_RESUME_SECTIONS } from './resume.defaults';
import { ResumeModule } from './resume.module';

describeDb('Currículo (integração)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp([ResumeModule]);
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });

  const api = () => request(t.http);
  const getResume = async () => (await api().get('/api/resume').expect(200)).body as ResumeDto;
  const section = (resume: ResumeDto, title: string) =>
    resume.sections.find((s) => s.title === title)!;

  it('cria as seções padrão no primeiro acesso, uma vez só', async () => {
    const first = await getResume();
    expect(first.sections.map((s) => s.title)).toEqual(DEFAULT_RESUME_SECTIONS.map((s) => s.title));
    expect(section(first, 'Contato').items.map((i) => i.data)).toEqual([
      { label: 'E-mail', value: '' },
      { label: 'Telefone/WhatsApp', value: '' },
    ]);

    await getResume();
    expect(await t.prisma.resumeSection.count()).toBe(DEFAULT_RESUME_SECTIONS.length);
  });

  it('acessos simultâneos não duplicam as seções padrão', async () => {
    await Promise.all(Array.from({ length: 5 }, () => api().get('/api/resume').expect(200)));
    expect(await t.prisma.resumeSection.count()).toBe(DEFAULT_RESUME_SECTIONS.length);
  });

  it('preenche um campo, adiciona experiência e exporta em texto', async () => {
    const resume = await getResume();
    const email = section(resume, 'Contato').items[0]!;

    await api()
      .patch(`/api/resume/items/${email.id}`)
      .send({ data: { label: 'E-mail', value: 'eu@email.com' } })
      .expect(200);

    const experience = section(resume, 'Experiência');
    const added = (
      await api()
        .post(`/api/resume/sections/${experience.id}/items`)
        .send({
          data: {
            title: 'Desenvolvedor Full Stack Trainee',
            organization: 'Empresa',
            startDate: '2026-01',
            current: true,
            description: 'APIs em NestJS.',
          },
        })
        .expect(201)
    ).body as ResumeItemDto;
    expect(added.position).toBe(0);

    const text = await api().get('/api/resume/export').expect(200);
    expect(text.headers['content-type']).toContain('text/plain');
    expect(text.text).toBe(
      'CONTATO\nE-mail: eu@email.com\n\n' +
        'EXPERIÊNCIA\nDesenvolvedor Full Stack Trainee — Empresa\n01/2026 – atual\nAPIs em NestJS.\n',
    );
  });

  it('item no formato errado para o tipo da seção -> 400 com o caminho do campo', async () => {
    const resume = await getResume();
    const summary = section(resume, 'Resumo profissional');
    const experience = section(resume, 'Experiência');

    await api()
      .post(`/api/resume/sections/${summary.id}/items`)
      .send({ data: { label: 'x', value: 'y' } })
      .expect(400);

    const response = await api()
      .post(`/api/resume/sections/${experience.id}/items`)
      .send({ data: { title: 'Dev', current: true, endDate: '2025-01' } })
      .expect(400);
    expect(response.body.issues[0].path).toBe('data.endDate');
  });

  it('cria, renomeia e apaga seção (levando os itens)', async () => {
    await getResume();
    const created = (
      await api()
        .post('/api/resume/sections')
        .send({ title: 'Voluntariado', kind: 'entries' })
        .expect(201)
    ).body as ResumeSectionDto;
    expect(created.position).toBe(DEFAULT_RESUME_SECTIONS.length);

    await api()
      .post(`/api/resume/sections/${created.id}/items`)
      .send({ data: { title: 'Monitoria' } })
      .expect(201);

    const renamed = await api()
      .patch(`/api/resume/sections/${created.id}`)
      .send({ title: 'Trabalho voluntário', kind: 'text' })
      .expect(200);
    // `kind` é ignorado: não muda depois de criada.
    expect(renamed.body).toMatchObject({ title: 'Trabalho voluntário', kind: 'entries' });

    await api().delete(`/api/resume/sections/${created.id}`).expect(204);
    expect(await t.prisma.resumeItem.count({ where: { sectionId: created.id } })).toBe(0);
  });

  it('reordena seções e itens; lista incompleta ou repetida -> 400', async () => {
    const resume = await getResume();
    const ids = resume.sections.map((s) => s.id);
    const reversed = [...ids].reverse();

    const reordered = (
      await api().put('/api/resume/sections/order').send({ ids: reversed }).expect(200)
    ).body as ResumeDto;
    expect(reordered.sections.map((s) => s.id)).toEqual(reversed);

    await api()
      .put('/api/resume/sections/order')
      .send({ ids: ids.slice(1) })
      .expect(400);
    await api()
      .put('/api/resume/sections/order')
      .send({ ids: [ids[0], ...ids.slice(0, -1)] })
      .expect(400);

    const links = section(resume, 'Links');
    const itemIds = links.items.map((i) => i.id);
    const newOrder = [itemIds[2]!, itemIds[0]!, itemIds[1]!];
    const linksAfter = (
      await api()
        .put(`/api/resume/sections/${links.id}/items/order`)
        .send({ ids: newOrder })
        .expect(200)
    ).body as ResumeSectionDto;
    expect(linksAfter.items.map((i) => (i.data as { label: string }).label)).toEqual([
      'Portfólio',
      'LinkedIn',
      'GitHub',
    ]);

    // Item de outra seção não entra na ordem desta.
    const contactItem = section(resume, 'Contato').items[0]!.id;
    await api()
      .put(`/api/resume/sections/${links.id}/items/order`)
      .send({ ids: [contactItem, itemIds[0], itemIds[1]] })
      .expect(400);
  });

  it('apagar item; 404 para seção e item inexistentes', async () => {
    const resume = await getResume();
    const item = section(resume, 'Idiomas').items[0]!;

    await api().delete(`/api/resume/items/${item.id}`).expect(204);
    await api().delete(`/api/resume/items/${item.id}`).expect(404);
    await api().patch('/api/resume/sections/nao-existe').send({ title: 'x' }).expect(404);
    await api()
      .post('/api/resume/sections/nao-existe/items')
      .send({ data: { text: 'x' } })
      .expect(404);
  });

  it('apagar todas as seções faz o padrão voltar no próximo acesso', async () => {
    const resume = await getResume();
    for (const s of resume.sections) {
      await api().delete(`/api/resume/sections/${s.id}`).expect(204);
    }

    expect((await getResume()).sections).toHaveLength(DEFAULT_RESUME_SECTIONS.length);
  });
});
