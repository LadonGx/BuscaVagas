import { describe, expect, it } from 'vitest';
import type { ResumeDto } from './resume';
import { parsePeriod, parseResumeLines, type ResumeImportLine } from './resume-import';
import { isBoldFont, pdfItemsToLines, type PdfTextItem } from './resume-import-pdf';
import {
  buildImportPlan,
  planToApplyInput,
  resumeImportApplySchema,
  sameValue,
} from './resume-import-plan';

/** "B 12 | TEXTO" → linha em negrito, fonte 12. */
const lines = (text: string): ResumeImportLine[] =>
  text
    .trim()
    .split('\n')
    .map((raw) => {
      const [, bold, size, content] = /^(B?)\s*([\d.]+)\s*\|\s?(.*)$/.exec(raw.trim())!;
      return { text: content!, size: Number(size), bold: bold === 'B', page: 1 };
    });

const ONE_COLUMN_PT = lines(`
B 20 | Maria Fernanda Souza
  12 | Desenvolvedora Full Stack Júnior
  10 | São Paulo, SP · (11) 98765-4321 · maria.souza@email.com
  10 | linkedin.com/in/mariasouza · github.com/mariasouza · mariasouza.dev
B 12 | RESUMO
  10 | Desenvolvedora com 1 ano de experiência em aplicações web com Node.js e
  10 | React. Gosto de testes automatizados.
B 12 | EXPERIÊNCIA PROFISSIONAL
B 10 | Desenvolvedora Full Stack Trainee
  10 | Acme Tecnologia · São Paulo, SP
  10 | jan/2025 – atual
  10 | • Desenvolvimento de APIs REST com NestJS e PostgreSQL.
  10 | • Telas em React Native para o app de
  10 | clientes.
B 10 | Estagiária de Desenvolvimento
  10 | Beta Sistemas Ltda | 03/2024 - 12/2024
  10 | • Manutenção de sistema legado em PHP.
B 12 | FORMAÇÃO ACADÊMICA
B 10 | Bacharelado em Engenharia de Computação
  10 | Centro Universitário Exemplo · 2021 – 2026
B 12 | COMPETÊNCIAS
  10 | TypeScript, Node.js, NestJS, React, PostgreSQL, Docker, Git
B 12 | IDIOMAS
  10 | Inglês – avançado
  10 | Espanhol: básico
B 12 | CURSOS E CERTIFICAÇÕES
  10 | AWS Cloud Practitioner – Amazon Web Services (2025)
  10 | Docker para desenvolvedores – Alura, 2024
B 12 | VOLUNTARIADO
  10 | Monitoria de lógica de programação na faculdade.
`);

describe('período', () => {
  it.each([
    ['jan/2025 – atual', { startDate: '2025-01', endDate: null, current: true }],
    ['03/2024 - 12/2024', { startDate: '2024-03', endDate: '2024-12', current: false }],
    ['Feb 2023 – Present', { startDate: '2023-02', endDate: null, current: true }],
    [
      'janeiro de 2022 a março de 2023',
      { startDate: '2022-01', endDate: '2023-03', current: false },
    ],
    ['2021 – 2026', { startDate: '2021-01', endDate: '2026-12', current: false }],
    ['desde 2024-05', { startDate: '2024-05', endDate: null, current: true }],
    ['Concluído em 2025', { startDate: null, endDate: '2025-12', current: false }],
  ])('%s', (text, expected) => {
    expect(parsePeriod(text)).toMatchObject(expected);
  });

  it('devolve o que sobra da linha; sem data, null', () => {
    expect(parsePeriod('Beta Sistemas Ltda | 03/2024 - 12/2024')?.rest).toBe('Beta Sistemas Ltda');
    expect(parsePeriod('Acme Tecnologia · São Paulo, SP')).toBeNull();
  });
});

describe('ler o currículo', () => {
  const draft = parseResumeLines(ONE_COLUMN_PT);

  it('nome, título e contato do cabeçalho', () => {
    expect(draft).toMatchObject({
      name: 'Maria Fernanda Souza',
      headline: 'Desenvolvedora Full Stack Júnior',
      contact: {
        email: 'maria.souza@email.com',
        phone: '(11) 98765-4321',
        linkedin: 'linkedin.com/in/mariasouza',
        github: 'github.com/mariasouza',
        portfolio: 'mariasouza.dev',
        location: 'São Paulo, SP',
      },
    });
  });

  it('seções reconhecidas por título, em PT; a desconhecida vira texto', () => {
    expect(draft.found.map((item) => item.key)).toEqual([
      'summary',
      'experience',
      'education',
      'skills',
      'languages',
      'courses',
      'other',
    ]);
    expect(draft.summary).toBe(
      'Desenvolvedora com 1 ano de experiência em aplicações web com Node.js e React. Gosto de testes automatizados.',
    );
    expect(draft.other).toEqual([
      { title: 'Voluntariado', text: 'Monitoria de lógica de programação na faculdade.' },
    ]);
  });

  it('experiências: cargo, empresa, local, período e bullets (com quebra de linha)', () => {
    expect(draft.experience).toEqual([
      {
        title: 'Desenvolvedora Full Stack Trainee',
        organization: 'Acme Tecnologia',
        location: 'São Paulo, SP',
        startDate: '2025-01',
        endDate: null,
        current: true,
        description:
          '• Desenvolvimento de APIs REST com NestJS e PostgreSQL.\n• Telas em React Native para o app de clientes.',
      },
      {
        title: 'Estagiária de Desenvolvimento',
        organization: 'Beta Sistemas Ltda',
        location: null,
        startDate: '2024-03',
        endDate: '2024-12',
        current: false,
        description: '• Manutenção de sistema legado em PHP.',
      },
    ]);
    expect(draft.education[0]).toMatchObject({
      title: 'Bacharelado em Engenharia de Computação',
      organization: 'Centro Universitário Exemplo',
      startDate: '2021-01',
      endDate: '2026-12',
    });
  });

  it('cursos de uma linha, competências e idiomas', () => {
    expect(draft.courses.map((c) => [c.title, c.organization, c.endDate])).toEqual([
      ['AWS Cloud Practitioner', 'Amazon Web Services', '2025-12'],
      ['Docker para desenvolvedores', 'Alura', '2024-12'],
    ]);
    expect(draft.skills).toEqual([
      {
        label: null,
        values: ['TypeScript', 'Node.js', 'NestJS', 'React', 'PostgreSQL', 'Docker', 'Git'],
      },
    ]);
    expect(draft.languages).toEqual([
      { label: 'Inglês', value: 'avançado' },
      { label: 'Espanhol', value: 'básico' },
    ]);
  });

  it('em inglês, "Cargo — Empresa", grupos de competências com rótulo', () => {
    const english = parseResumeLines(
      lines(`
B 22 | JOÃO PEDRO LIMA
  12 | Back-end Developer
B 11 | CONTACT
 9.5 | joao.lima@mail.com
 9.5 | +55 19 99876-5432
 9.5 | Campinas - SP, Brazil
B 11 | SKILLS
 9.5 | Languages: Java, Kotlin
 9.5 | Databases: PostgreSQL; Redis
B 11 | EXPERIENCE
B 10 | Software Engineer — Gama Pagamentos
 9.5 | Feb 2023 – Present · Remote
 9.5 | - Built payment microservices.
`),
    );
    expect(english).toMatchObject({
      name: 'João Pedro Lima',
      headline: 'Back-end Developer',
      contact: { phone: '+55 19 99876-5432', location: 'Campinas, SP' },
      skills: [
        { label: 'Languages', values: ['Java', 'Kotlin'] },
        { label: 'Databases', values: ['PostgreSQL', 'Redis'] },
      ],
    });
    expect(english.experience[0]).toMatchObject({
      title: 'Software Engineer',
      organization: 'Gama Pagamentos',
      location: 'Remote',
      current: true,
      description: '• Built payment microservices.',
    });
  });

  it('PDF sem texto (escaneado): rascunho vazio, sem lançar', () => {
    expect(parseResumeLines([])).toMatchObject({ name: null, experience: [], found: [] });
  });
});

describe('PDF → linhas', () => {
  const item = (text: string, x: number, y: number, size = 10, bold = false): PdfTextItem => ({
    text,
    x,
    y,
    width: text.length * size * 0.5,
    size,
    bold,
  });

  it('junta os pedaços da mesma linha e põe espaço onde há vão', () => {
    expect(
      pdfItemsToLines(
        [item('Desenvolvedora', 50, 700), item('Full', 125, 700), item('Stack', 150, 700.4)],
        595,
      ),
    ).toEqual([{ text: 'Desenvolvedora Full Stack', size: 10, bold: false, page: 1 }]);
  });

  it('duas colunas: a da esquerda inteira, depois a da direita', () => {
    const left = ['CONTACT', 'a@b.com', 'SKILLS', 'Java', 'Kotlin'].map((text, i) =>
      item(text, 40, 780 - i * 14, 9, i % 2 === 0),
    );
    const right = [
      'EXPERIENCE',
      'Engineer — Gama',
      'Feb 2023 – Present',
      '- Built APIs',
      'EDUCATION',
    ].map((text, i) => item(text, 220, 780 - i * 14, 9));
    const result = pdfItemsToLines([...left, ...right], 595).map((line) => line.text);
    expect(result).toEqual([
      'CONTACT',
      'a@b.com',
      'SKILLS',
      'Java',
      'Kotlin',
      'EXPERIENCE',
      'Engineer — Gama',
      'Feb 2023 – Present',
      '- Built APIs',
      'EDUCATION',
    ]);
  });

  it('fonte em negrito pelo nome', () => {
    expect(isBoldFont('ABCDEF+Calibri-Bold')).toBe(true);
    expect(isBoldFont('Inter-SemiBold')).toBe(true);
    expect(isBoldFont('Helvetica')).toBe(false);
  });
});

/* --------------------------------------------------------- o plano */

const resume = (): ResumeDto => ({
  sections: [
    {
      id: 's-dados',
      title: 'Dados pessoais',
      kind: 'fields',
      position: 0,
      items: [
        { id: 'i-nome', position: 0, data: { label: 'Nome completo', value: 'Maria F. Souza' } },
        { id: 'i-cidade', position: 1, data: { label: 'Cidade/UF', value: '' } },
      ],
    },
    {
      id: 's-contato',
      title: 'Contato',
      kind: 'fields',
      position: 1,
      items: [{ id: 'i-email', position: 0, data: { label: 'E-mail', value: '' } }],
    },
    {
      id: 's-resumo',
      title: 'Resumo profissional',
      kind: 'text',
      position: 2,
      items: [{ id: 'i-resumo', position: 0, data: { text: '' } }],
    },
    {
      id: 's-exp',
      title: 'Experiência',
      kind: 'entries',
      position: 3,
      items: [
        {
          id: 'i-acme',
          position: 0,
          data: {
            title: 'Desenvolvedora Full Stack Trainee',
            organization: 'ACME Tecnologia',
            location: null,
            startDate: '2025-01',
            endDate: null,
            current: true,
            description: null,
          },
        },
      ],
    },
    {
      id: 's-comp',
      title: 'Competências',
      kind: 'fields',
      position: 4,
      items: [
        { id: 'i-ling', position: 0, data: { label: 'Linguagens', value: 'JavaScript' } },
        { id: 'i-fw', position: 1, data: { label: 'Frameworks', value: '' } },
      ],
    },
  ],
});

describe('plano da importação (só completa)', () => {
  const changes = buildImportPlan(resume(), parseResumeLines(ONE_COLUMN_PT));
  const find = (predicate: (change: (typeof changes)[number]) => boolean) =>
    changes.find(predicate)!;

  it('campo vazio é preenchido; preenchido aparece desmarcado com o atual', () => {
    expect(find((c) => c.type === 'field' && c.label === 'Cidade/UF')).toMatchObject({
      itemId: 'i-cidade',
      current: '',
      incoming: 'São Paulo, SP',
      selected: true,
    });
    expect(find((c) => c.type === 'field' && c.label === 'Nome completo')).toMatchObject({
      current: 'Maria F. Souza',
      incoming: 'Maria Fernanda Souza',
      selected: false,
    });
    expect(find((c) => c.type === 'text' && c.sectionId === 's-resumo')).toMatchObject({
      itemId: 'i-resumo',
      selected: true,
    });
  });

  it('seção que não existe entra como nova; campo novo sem item', () => {
    expect(find((c) => c.type === 'field' && c.label === 'LinkedIn')).toMatchObject({
      sectionId: null,
      sectionTitle: 'Links',
      itemId: null,
      incoming: 'linkedin.com/in/mariasouza',
      selected: true,
    });
    expect(find((c) => c.type === 'field' && c.label === 'Título profissional')).toMatchObject({
      sectionId: 's-dados',
      itemId: null,
    });
  });

  it('experiência repetida (mesmo título e empresa) vem desmarcada', () => {
    const entries = changes.filter((c) => c.type === 'entry' && c.sectionId === 's-exp');
    expect(entries.map((c) => [c.type === 'entry' && c.data.title, c.selected])).toEqual([
      ['Desenvolvedora Full Stack Trainee', false],
      ['Estagiária de Desenvolvimento', true],
    ]);
  });

  it('competências: soltas vão para os grupos; o campo preenchido ganha só as que faltam', () => {
    expect(find((c) => c.type === 'field' && c.itemId === 'i-ling')).toMatchObject({
      current: 'JavaScript',
      incoming: 'JavaScript, TypeScript',
      selected: false,
    });
    expect(find((c) => c.type === 'field' && c.itemId === 'i-fw')).toMatchObject({
      incoming: 'Node.js, NestJS, React',
      selected: true,
    });
    expect(find((c) => c.type === 'field' && c.label === 'Banco de dados')).toMatchObject({
      sectionId: 's-comp',
      itemId: null,
      incoming: 'PostgreSQL',
    });
    expect(find((c) => c.type === 'field' && c.label === 'Ferramentas')).toMatchObject({
      incoming: 'Docker, Git',
    });
  });

  it('as marcadas viram o corpo do POST, com seções novas agrupadas', () => {
    const input = planToApplyInput(changes);
    expect(resumeImportApplySchema.safeParse(input).success).toBe(true);
    expect(input.updates).toContainEqual({
      itemId: 'i-cidade',
      data: { label: 'Cidade/UF', value: 'São Paulo, SP' },
    });
    expect(input.updates.find((u) => u.itemId === 'i-nome')).toBeUndefined();
    expect(input.creates).toContainEqual({
      sectionId: 's-dados',
      data: { label: 'Título profissional', value: 'Desenvolvedora Full Stack Júnior' },
    });
    const links = input.sections.find((s) => s.title === 'Links');
    expect(links).toEqual({
      title: 'Links',
      kind: 'fields',
      items: [
        { label: 'LinkedIn', value: 'linkedin.com/in/mariasouza' },
        { label: 'GitHub', value: 'github.com/mariasouza' },
        { label: 'Portfólio', value: 'mariasouza.dev' },
      ],
    });
    expect(input.sections.map((s) => s.title)).toEqual(
      expect.arrayContaining(['Formação', 'Idiomas', 'Cursos e certificações', 'Voluntariado']),
    );
  });

  it('o mesmo valor escrito de outro jeito não vira mudança', () => {
    expect(sameValue('Campinas/SP', 'Campinas, SP')).toBe(true);
    expect(sameValue('(19) 99876-5432', '+55 19 99876-5432')).toBe(true);
    expect(sameValue('(19) 99876-5432', '(19) 99876-0000')).toBe(false);
    expect(sameValue('Ana Souza', 'Ana Souza Lima')).toBe(false);
  });

  it('nada marcado: o schema recusa', () => {
    expect(resumeImportApplySchema.safeParse(planToApplyInput([])).success).toBe(false);
  });
});

/* ------------------------------------------------- layout "ATS" real */

/**
 * O layout de um currículo real (dados trocados): empresa em negrito com o
 * cargo em itálico embaixo; local e período alinhados à direita na mesma
 * linha; idiomas e apresentação no cabeçalho, sem seção "Resumo".
 */
const ATS_LAYOUT = lines(`
B 12 | ANA BEATRIZ ROCHA
   8 | github.com/anarocha · linkedin.com/in/ana-b-rocha · ana.rocha@mail.com · (11) 91234-5678
   8 | Idiomas: Português Nativo · Inglês Avançado
 8.5 | Desenvolvedora Full Stack com 1 ano de experiência em produção, cursando Ciência da Computação (7º semestre).
 8.5 | Atuei em apps mobile publicados nas lojas.
B 10.5 | Educação
B 9 | FATECSorocaba — Ciência da Computação
   8 | Sorocaba, SP · Noturno · 7º Semestre
   8 | Bacharelado em Ciência da Computação — Previsão de conclusão: 12/2027
B 10.5 | Experiência Profissional
B 9 | Orbital
   8 | Sorocaba, SP Jul 2025 – Abr 2026
 8.5 | Desenvolvedora Full Stack Trainee
 8.5 | - Conduzi o desenvolvimento de um sistema com NestJS e PostgreSQL, frontend em React e
 8.5 | deploy com Docker
B 9 | Prefeitura Municipal de Itu
   8 | Itu, SP Mai 2023 – Fev 2025
 8.5 | Estagiária de TI
 8.5 | - Suporte técnico aos usuários
B 10.5 | Projetos em Destaque
B 8 | App Carteira (React Native · White-label · Play Store)
   8 | - App financeiro nas duas lojas
B 10.5 | Habilidades Técnicas
B 8 | Frontend: React, React Native, TypeScript
B 8 | Processo: Git, Jira, Scrum, Power BI, Python (OpenCV,
   8 | YOLOv8), Figma
`);

describe('layout de currículo "ATS" (empresa em negrito, cargo embaixo)', () => {
  const draft = parseResumeLines(ATS_LAYOUT);

  it('cabeçalho: idiomas na linha "Idiomas:" e a apresentação vira o resumo', () => {
    expect(draft.languages).toEqual([
      { label: 'Português', value: 'Nativo' },
      { label: 'Inglês', value: 'Avançado' },
    ]);
    expect(draft.summary).toMatch(
      /^Desenvolvedora Full Stack com 1 ano [\s\S]* publicados nas lojas\.$/,
    );
    expect(draft.contact).toMatchObject({
      phone: '(11) 91234-5678',
      github: 'github.com/anarocha',
    });
  });

  it('experiência: cargo embaixo vira título, a empresa em negrito vira organização, local e período à parte', () => {
    expect(
      draft.experience.map((e) => [e.title, e.organization, e.location, e.startDate, e.endDate]),
    ).toEqual([
      ['Desenvolvedora Full Stack Trainee', 'Orbital', 'Sorocaba, SP', '2025-07', '2026-04'],
      ['Estagiária de TI', 'Prefeitura Municipal de Itu', 'Itu, SP', '2023-05', '2025-02'],
    ]);
    expect(draft.experience[0]!.description).toBe(
      '• Conduzi o desenvolvimento de um sistema com NestJS e PostgreSQL, frontend em React e deploy com Docker',
    );
  });

  it('formação: curso como título, escola (sem o curso repetido), turno e semestre na descrição', () => {
    expect(draft.education).toEqual([
      {
        title: 'Bacharelado em Ciência da Computação',
        organization: 'FATEC Sorocaba',
        location: 'Sorocaba, SP',
        startDate: null,
        endDate: '2027-12',
        current: false,
        description: 'Noturno · 7º Semestre',
      },
    ]);
  });

  it('projetos: as tecnologias entre parênteses vão para a descrição', () => {
    expect(draft.projects[0]).toMatchObject({
      title: 'App Carteira',
      description: 'React Native · White-label · Play Store\n• App financeiro nas duas lojas',
    });
  });

  it('competências: rótulos, linha quebrada e parênteses com vírgula', () => {
    expect(draft.skills).toEqual([
      { label: 'Frontend', values: ['React', 'React Native', 'TypeScript'] },
      {
        label: 'Processo',
        values: ['Git', 'Jira', 'Scrum', 'Power BI', 'Python (OpenCV, YOLOv8)', 'Figma'],
      },
    ]);
  });

  it('valor de exemplo ("voce@email.com") conta como vazio: vem marcado', () => {
    const base = resume();
    base.sections[1]!.items[0]!.data = { label: 'E-mail', value: 'voce@email.com' };
    const change = buildImportPlan(base, draft).find(
      (c) => c.type === 'field' && c.label === 'E-mail',
    );
    expect(change).toMatchObject({ current: 'voce@email.com', selected: true });
  });
});

describe('PDF → linhas: texto alinhado à direita', () => {
  it('local e período menores, à direita, vêm DEPOIS da empresa da mesma linha', () => {
    const items: PdfTextItem[] = [
      { text: 'Orbital', x: 57, y: 635.67, width: 30, size: 9, bold: true },
      { text: 'Sorocaba, SP', x: 420, y: 636.42, width: 48, size: 8, bold: false },
      { text: 'Jul 2025 – Abr 2026', x: 473, y: 636.42, width: 65, size: 8, bold: false },
      { text: 'Desenvolvedora', x: 57, y: 625, width: 60, size: 8.5, bold: false },
    ];
    expect(pdfItemsToLines(items, 595).map((line) => [line.text, line.bold])).toEqual([
      ['Orbital', true],
      ['Sorocaba, SP Jul 2025 – Abr 2026', false],
      ['Desenvolvedora', false],
    ]);
  });

  it('linha que COMEÇA em negrito conta como negrito', () => {
    const items: PdfTextItem[] = [
      { text: 'App Carteira', x: 57, y: 300, width: 40, size: 8.5, bold: true },
      {
        text: '(React Native · White-label · Play Store)',
        x: 100,
        y: 300,
        width: 150,
        size: 8,
        bold: false,
      },
    ];
    expect(pdfItemsToLines(items, 595)[0]).toMatchObject({ bold: true });
  });
});
