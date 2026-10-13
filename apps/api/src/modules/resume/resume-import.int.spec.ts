import {
  buildImportPlan,
  parseResumeLines,
  planToApplyInput,
  type ResumeDto,
  type ResumeImportLine,
} from '@busca-vagas/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestApp, describeDb, resetDatabase, type TestApp } from '../../../test/helpers';
import { ResumeModule } from './resume.module';

const line = (text: string, size = 10, bold = false): ResumeImportLine => ({
  text,
  size,
  bold,
  page: 1,
});

/** O que o navegador extrai de um PDF simples. */
const PDF_LINES: ResumeImportLine[] = [
  line('Maria Souza', 20, true),
  line('maria@email.com · (11) 98765-4321 · Campinas, SP'),
  line('EXPERIÊNCIA', 12, true),
  line('Desenvolvedora Trainee', 10, true),
  line('Acme · jan/2025 – atual'),
  line('• APIs com NestJS.'),
  line('VOLUNTARIADO', 12, true),
  line('Monitoria de lógica.'),
];

describeDb('Currículo — importar de PDF (integração)', () => {
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

  it('aplica o plano: preenche campos vazios, adiciona entradas e cria a seção nova', async () => {
    const before = await getResume();
    const changes = buildImportPlan(before, parseResumeLines(PDF_LINES));
    const after = (
      await api().post('/api/resume/import').send(planToApplyInput(changes)).expect(200)
    ).body as ResumeDto;

    expect(section(after, 'Dados pessoais').items.map((i) => i.data)).toEqual(
      expect.arrayContaining([
        { label: 'Nome completo', value: 'Maria Souza' },
        { label: 'Cidade/UF', value: 'Campinas, SP' },
      ]),
    );
    expect(section(after, 'Contato').items.map((i) => i.data)).toEqual([
      { label: 'E-mail', value: 'maria@email.com' },
      { label: 'Telefone/WhatsApp', value: '(11) 98765-4321' },
    ]);
    expect(section(after, 'Experiência').items[0]?.data).toMatchObject({
      title: 'Desenvolvedora Trainee',
      organization: 'Acme',
      startDate: '2025-01',
      current: true,
      description: '• APIs com NestJS.',
    });
    const created = after.sections.at(-1)!;
    expect(created).toMatchObject({ title: 'Voluntariado', kind: 'text' });
    expect(created.items[0]?.data).toEqual({ text: 'Monitoria de lógica.' });
    expect(created.position).toBe(before.sections.length);

    // De novo: nada a completar nos campos; a experiência agora é repetida.
    const again = buildImportPlan(after, parseResumeLines(PDF_LINES));
    expect(again.filter((change) => change.selected)).toEqual([]);
  });

  it('é tudo ou nada: um item inválido não grava nenhum', async () => {
    const resume = await getResume();
    const email = section(resume, 'Contato').items[0]!;
    const experience = section(resume, 'Experiência');

    const response = await api()
      .post('/api/resume/import')
      .send({
        updates: [{ itemId: email.id, data: { label: 'E-mail', value: 'x@y.com' } }],
        creates: [{ sectionId: experience.id, data: { title: '' } }],
      })
      .expect(400);
    expect(response.body.issues[0].path).toBe('creates.0.data.title');
    expect(section(await getResume(), 'Contato').items[0]?.data).toEqual({
      label: 'E-mail',
      value: '',
    });

    await api()
      .post('/api/resume/import')
      .send({ updates: [{ itemId: 'nao-existe', data: { text: 'x' } }] })
      .expect(404);
    await api().post('/api/resume/import').send({}).expect(400);
  });
});
