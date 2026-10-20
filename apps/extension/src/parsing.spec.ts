import { describe, expect, it, vi } from 'vitest';
import { createJob, findApp, normalizeAppUrl, openUrlFor } from './app-client';
import { emptyDraft, toCreateInput } from './draft';
import { draftFromJsonLd } from './jsonld';
import { describePasted, readPastedText } from './pasted-text';
import { guessFromTabTitle } from './tab-title';

const jobPosting = {
  '@context': 'https://schema.org',
  '@type': 'JobPosting',
  title: 'Desenvolvedor(a) Full Stack Júnior',
  description: '<p>Vaga <b>remota</b>.</p><ul><li>Node</li><li>React</li></ul>',
  datePosted: '2026-10-10T12:00:00-03:00',
  employmentType: ['FULL_TIME', 'INTERN'],
  hiringOrganization: { '@type': 'Organization', name: 'Acme Pagamentos' },
  jobLocation: {
    '@type': 'Place',
    address: { addressLocality: 'Campinas', addressRegion: 'SP', addressCountry: 'BR' },
  },
  baseSalary: {
    '@type': 'MonetaryAmount',
    currency: 'brl',
    value: { minValue: 3000, maxValue: '4500', unitText: 'MONTH' },
  },
};

describe('JSON-LD JobPosting', () => {
  it('lê título, empresa, local, contrato, data, salário e descrição em texto', () => {
    expect(draftFromJsonLd([JSON.stringify(jobPosting)])).toEqual({
      title: 'Desenvolvedor(a) Full Stack Júnior',
      company: 'Acme Pagamentos',
      location: 'Campinas, SP',
      workModel: null,
      contractType: 'internship',
      description: 'Vaga remota.\nNode\nReact',
      postedAt: '2026-10-10',
      salaryMin: 3000,
      salaryMax: 4500,
      salaryCurrency: 'BRL',
      salaryPeriod: 'month',
    });
  });

  it('acha a vaga dentro de @graph e de listas; TELECOMMUTE = remota', () => {
    const graph = {
      '@graph': [
        { '@type': 'WebSite', name: 'Carreiras' },
        { ...jobPosting, jobLocationType: 'TELECOMMUTE', jobLocation: undefined },
      ],
    };
    const draft = draftFromJsonLd([
      '{ quebrado',
      JSON.stringify([{ '@type': 'BreadcrumbList' }]),
      JSON.stringify(graph),
    ]);
    expect(draft).toMatchObject({ workModel: 'remote', location: '', company: 'Acme Pagamentos' });
  });

  it('página sem JobPosting: null', () => {
    expect(draftFromJsonLd([JSON.stringify({ '@type': 'Organization' })])).toBeNull();
    expect(draftFromJsonLd([])).toBeNull();
  });
});

describe('título da aba (sites restritos)', () => {
  const linkedin = 'https://www.linkedin.com/jobs/view/1';
  it.each([
    [
      '(3) Desenvolvedor Fullstack - Matriz | Grupo Bamaq | LinkedIn',
      linkedin,
      { title: 'Desenvolvedor Fullstack - Matriz', company: 'Grupo Bamaq', location: '' },
    ],
    [
      'Desenvolvedor(a) Full Stack Júnior – Node.js | React Native | Vericode | LinkedIn',
      linkedin,
      {
        title: 'Desenvolvedor(a) Full Stack Júnior – Node.js | React Native',
        company: 'Vericode',
        location: '',
      },
    ],
    [
      'Desenvolvedor Back-end - Remoto - Acme',
      'https://acme.com/vagas/1',
      { title: 'Desenvolvedor Back-end - Remoto', company: 'Acme', workModel: 'remote' },
    ],
    [
      'wevy está contratando Desenvolvedor Júnior em Brasil (Remoto) | LinkedIn',
      linkedin,
      {
        title: 'Desenvolvedor Júnior',
        company: 'wevy',
        location: 'Brasil (Remoto)',
        workModel: 'remote',
      },
    ],
    [
      'Acme hiring Software Engineer in São Paulo, SP | LinkedIn',
      linkedin,
      { title: 'Software Engineer', company: 'Acme', location: 'São Paulo, SP' },
    ],
    [
      'Desenvolvedor Full Stack - São Paulo, SP - Indeed.com',
      'https://br.indeed.com/viewjob?jk=1',
      { title: 'Desenvolvedor Full Stack', company: '', location: 'São Paulo, SP' },
    ],
    [
      'Analista de Suporte N2 | Gaudium | Glassdoor',
      'https://www.glassdoor.com.br/job-listing/j?jl=1',
      { title: 'Analista de Suporte N2', company: 'Gaudium' },
    ],
  ])('%s', (title, url, expected) => {
    expect(guessFromTabTitle(title, url)).toMatchObject(expected);
  });
});

describe('texto colado da página', () => {
  const now = new Date(2026, 9, 15, 12);

  it('LinkedIn: empresa, título, local, data, modalidade e a descrição de "Sobre a vaga"', () => {
    const text = [
      'Grupo Hcode',
      'Desenvolvedor(a) Back-end Júnior',
      'Brasil\u00a0 · há 1 semana · Mais de 100 pessoas clicaram em Candidate-se',
      '',
      'Respostas gerenciadas fora do LinkedIn',
      'Corresponde às suas preferências de vaga, o tipo de local de trabalho é Remoto.',
      'Remoto',
      'Tempo integral',
      'Candidatar-se',
      'Salvar',
      'Seu perfil e currículo correspondem bem às qualificações obrigatórias',
      'Sobre a vaga',
      'Tecnologia',
      '',
      '',
      '',
      'Vaga remota para dev back-end júnior com TypeScript e NestJS. Contratação CLT ou PJ.',
      'Sobre a empresa',
      'A Hcode ensina programação.',
    ].join('\n');
    const fields = readPastedText(text, now);
    expect(fields).toEqual({
      company: 'Grupo Hcode',
      title: 'Desenvolvedor(a) Back-end Júnior',
      location: 'Brasil',
      workModel: 'remote',
      age: 'há 1 semana',
      postedAt: '2026-10-08',
      description:
        'Tecnologia\n\nVaga remota para dev back-end júnior com TypeScript e NestJS. Contratação CLT ou PJ.',
    });
    expect(describePasted(fields)).toBe(
      'Do texto: local, modalidade, data (há 1 semana) e descrição.',
    );
  });

  it('página inteira (Ctrl+A): vale a linha da vaga aberta, a mais perto de "Sobre a vaga"', () => {
    const text = [
      'Vagas recomendadas',
      'Analista de Dados',
      'Outra Empresa',
      'São Paulo, SP (Híbrido) · há 2 dias',
      'wevy',
      'Desenvolvedor Júnior',
      'Brasil · Republicada há 1 mês · 87 candidaturas',
      'Presencial',
      'Estágio',
      'R$ 1.800/mês',
      'About the job',
      'Bolsa de estágio.',
    ].join('\n');
    expect(readPastedText(text, now)).toMatchObject({
      company: 'wevy',
      title: 'Desenvolvedor Júnior',
      location: 'Brasil',
      workModel: 'onsite',
      contractType: 'internship',
      postedAt: '2026-09-15',
      salaryMin: 1800,
      salaryMax: 1800,
      salaryCurrency: 'BRL',
      salaryPeriod: 'month',
    });
  });

  it('formato antigo e em inglês; salário na descrição', () => {
    const text = [
      'Software Engineer',
      'Acme · São Paulo, SP (Remote) · 3 days ago · Over 100 applicants',
      'Full-time',
      'About the job',
      'Salário: R$ 4 mil a R$ 6 mil por mês, CLT.',
    ].join('\n');
    expect(readPastedText(text, now)).toMatchObject({
      company: 'Acme',
      title: 'Software Engineer',
      location: 'São Paulo, SP',
      workModel: 'remote',
      postedAt: '2026-10-12',
      salaryMin: 4000,
      salaryMax: 6000,
      contractType: 'clt',
    });
  });

  it('Indeed: "Descrição completa da vaga"; benefício e frase sobre a empresa não viram etiqueta', () => {
    const text = [
      'Desenvolvedor Full Stack Júnior',
      'Acme Tecnologia',
      'Campinas, SP',
      'Publicada há 2 dias',
      'Presencial',
      'R$ 4.000 - R$ 5.500 por mês',
      'Candidatar-se',
      'Detalhes da vaga',
      'Benefícios',
      'Vale-refeição de R$ 35 por dia',
      'Descrição completa da vaga',
      'A Acme é uma empresa 100% remota, mas esta vaga é presencial em Campinas.',
      'Bônus anual.',
    ].join('\n');
    const fields = readPastedText(text, now);
    expect(fields).toMatchObject({
      location: 'Campinas, SP',
      workModel: 'onsite',
      postedAt: '2026-10-13',
      salaryMin: 4000,
      salaryMax: 5500,
      salaryPeriod: 'month',
      description:
        'A Acme é uma empresa 100% remota, mas esta vaga é presencial em Campinas.\nBônus anual.',
    });
    // "Campinas, SP" é o local, não o título.
    expect(fields.title).toBeUndefined();
    expect(fields.company).toBeUndefined();
  });

  it('Indeed sem título nem data: nada de etiqueta; salário só com a palavra salário', () => {
    const text = [
      'Desenvolvedor Full Stack Júnior',
      'Campinas, SP',
      'Benefícios',
      'Vale-refeição de R$ 35 por dia',
      'A Acme é uma empresa 100% remota, mas esta vaga é presencial.',
      'Remuneração: R$ 4.000 + bônus anual',
    ].join('\n');
    const fields = readPastedText(text, now);
    expect(fields.workModel).toBeUndefined();
    expect(fields.title).toBeUndefined();
    expect(fields).toMatchObject({ salaryMin: 4000, salaryMax: 4000, salaryPeriod: 'month' });
    expect(
      readPastedText('Vale-refeição de R$ 35 por dia\nTrabalho remoto às sextas', now),
    ).not.toHaveProperty('salaryMin');
  });

  it('"Brasil · Remoto · há 2 dias": Brasil é o local, a empresa vem de cima', () => {
    const text = [
      'Acme',
      'Desenvolvedor Júnior',
      'Brasil · Remoto · há 2 dias · 30 candidaturas',
      'Full job description',
      'Vaga para dev júnior.',
    ].join('\n');
    expect(readPastedText(text, now)).toMatchObject({
      company: 'Acme',
      title: 'Desenvolvedor Júnior',
      location: 'Brasil',
      workModel: 'remote',
      description: 'Vaga para dev júnior.',
    });
  });

  it.each([
    ['Descrição da vaga'],
    ['Descrição completa da vaga'],
    ['Full job description'],
    ['Job details'],
    ['Sobre a vaga:'],
  ])('título da descrição: %s', (heading) => {
    expect(readPastedText(`Acme\n${heading}\nTexto da vaga.`, now).description).toBe(
      'Texto da vaga.',
    );
  });

  it('período do salário: só o que vem colado no valor', () => {
    const salary = (line: string) => {
      const { salaryMin, salaryMax, salaryPeriod } = readPastedText(
        `${line}\nSobre a vaga\nx`,
        now,
      );
      return { salaryMin, salaryMax, salaryPeriod };
    };
    expect(salary('R$ 60 mil/ano')).toEqual({
      salaryMin: 60000,
      salaryMax: 60000,
      salaryPeriod: 'year',
    });
    expect(salary('Salário: R$ 120.000 por ano')).toMatchObject({ salaryPeriod: 'year' });
    expect(salary('Salário: R$ 120.000 anual')).toMatchObject({ salaryPeriod: 'year' });
    expect(salary('R$ 50/h')).toMatchObject({ salaryMin: 50, salaryPeriod: 'hour' });
    expect(salary('R$ 50 por hora')).toMatchObject({ salaryPeriod: 'hour' });
    expect(salary('R$ 4.000 + bônus anual')).toMatchObject({
      salaryMin: 4000,
      salaryPeriod: 'month',
    });
    expect(salary('R$ 4.000 há 2 dias')).toMatchObject({ salaryPeriod: 'month' });
  });

  it('texto sem os dados da vaga: só a descrição', () => {
    const fields = readPastedText('Uma vaga legal.\nMande seu currículo.', now);
    expect(fields).toEqual({ description: 'Uma vaga legal.\nMande seu currículo.' });
    expect(readPastedText('   \n ', now)).toEqual({});
    expect(describePasted({})).toBe('Não achei os dados da vaga nesse texto.');
  });
});

describe('rascunho e endereço do app', () => {
  it('rascunho → corpo do POST (sem salário vazio, com a triagem)', () => {
    const input = toCreateInput(
      {
        ...emptyDraft('https://x.com/v/1'),
        title: ' Dev ',
        company: 'Acme',
        location: ' ',
        postedAt: '2026-10-10',
      },
      'saved',
    );
    expect(input).toEqual({
      title: 'Dev',
      company: 'Acme',
      url: 'https://x.com/v/1',
      location: null,
      workModel: null,
      contractType: null,
      description: null,
      postedAt: new Date('2026-10-10'),
      stack: [],
      triage: 'saved',
    });
  });

  it('só aceita endereços desta máquina', () => {
    expect(normalizeAppUrl('http://localhost:8080/vagas')).toBe('http://localhost:8080');
    expect(normalizeAppUrl('http://192.168.0.5:8080')).toBeNull();
    expect(normalizeAppUrl('https://127.0.0.1:8080')).toBeNull();
    expect(normalizeAppUrl('lixo')).toBeNull();
  });

  it('POST com Content-Type: application/json; GET sem', async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: 'ok', id: 'j1' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    await findApp(fetchFn as unknown as typeof fetch, null);
    await createJob(
      fetchFn as unknown as typeof fetch,
      'http://127.0.0.1:8080',
      toCreateInput({ ...emptyDraft('https://x.com/v/1'), title: 'Dev', company: 'Acme' }, 'inbox'),
    );
    const calls = fetchFn.mock.calls as unknown as [string, RequestInit][];
    const type = (init: RequestInit) => new Headers(init.headers).get('Content-Type');
    expect(type(calls[0]![1])).toBeNull();
    expect(calls.at(-1)![1].method).toBe('POST');
    expect(type(calls.at(-1)![1])).toBe('application/json');
  });

  it('link da vaga no app: Docker na mesma porta; dev na porta do Vite', () => {
    expect(openUrlFor('http://127.0.0.1:8080', 'j1')).toBe('http://127.0.0.1:8080/vagas?vaga=j1');
    expect(openUrlFor('http://127.0.0.1:3333', 'j1')).toBe('http://127.0.0.1:5173/vagas?vaga=j1');
  });
});
