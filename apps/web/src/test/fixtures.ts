import type {
  ApplicationDetailDto,
  ApplicationSummaryDto,
  DashboardDto,
  JobCountsDto,
  JobDto,
  PreferencesDto,
  ResumeDto,
  ResumeItemData,
  ResumeSectionDto,
  ResumeSectionKind,
  SourceInfoDto,
  SourceRunDto,
} from '@busca-vagas/shared';

export const counts = (overrides: Partial<JobCountsDto> = {}): JobCountsDto => ({
  triage: { inbox: 142, saved: 18, dismissed: 25 },
  withApplication: 9,
  score: { great: 42, good: 61, weak: 20, incompatible: 18, pending: 0, unscored: 1 },
  swipeable: 87,
  inboxClosed: 0,
  ...overrides,
});

export const summary = (overrides: Partial<ApplicationSummaryDto> = {}): ApplicationSummaryDto => ({
  applied: 4,
  in_process: 2,
  offer: 1,
  rejected: 1,
  withdrawn: 1,
  total: 9,
  ...overrides,
});

export const run = (overrides: Partial<SourceRunDto> = {}): SourceRunDto => ({
  id: 'run-1',
  sourceId: 'gupy',
  status: 'ok',
  trigger: 'schedule',
  terms: ['desenvolvedor'],
  jobsFound: 387,
  jobsNew: 23,
  dropped: 0,
  filtered: 0,
  durationMs: 4000,
  error: null,
  // 2 h e 1 min atrás: "há 2 h" sem depender dos milissegundos do teste.
  startedAt: new Date(Date.now() - 2 * 3_600_000 - 60_000).toISOString(),
  finishedAt: new Date(Date.now() - 2 * 3_600_000 - 60_000).toISOString(),
  ...overrides,
});

export const source = (overrides: Partial<SourceInfoDto> = {}): SourceInfoDto => ({
  id: 'gupy',
  displayName: 'Gupy',
  kind: 'search',
  active: true,
  reason: null,
  trackedCompanies: null,
  lastRun: run(),
  nextRunAt: new Date(Date.now() + 4 * 3_600_000).toISOString(),
  running: false,
  ...overrides,
});

export const inactiveBoard = (): SourceInfoDto =>
  source({
    id: 'greenhouse',
    displayName: 'Greenhouse',
    kind: 'company-board',
    active: false,
    reason: 'Nenhuma empresa acompanhada — adicione em Preferências → Fontes → Empresas',
    trackedCompanies: 0,
    lastRun: null,
    nextRunAt: null,
  });

export const healthy = { status: 'ok', checks: { database: 'up', redis: 'up' }, uptimeSeconds: 10 };

export const job = (overrides: Partial<JobDto> = {}): JobDto => ({
  id: 'job-1',
  source: 'gupy',
  externalId: '1',
  url: 'https://empresa.gupy.io/jobs/1',
  title: 'Desenvolvedor(a) Full Stack Júnior',
  company: 'Acme Pagamentos',
  description: 'Descrição da vaga.',
  location: 'Campinas, SP',
  notes: null,
  workModel: 'hybrid',
  contractType: 'clt',
  seniority: 'junior',
  stack: ['node.js', 'react', 'typescript', 'postgresql'],
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
  salaryPeriod: null,
  postedAt: null,
  firstSeenAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  lastSeenAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  triage: 'inbox',
  triagedAt: null,
  dismissReason: null,
  application: null,
  score: 912,
  scoreCoverage: 100,
  scoreReasons: [
    { criterion: 'stack', kind: 'plus', text: 'Node.js, React, TypeScript (3 de 4 principais)' },
    { criterion: 'seniority', kind: 'plus', text: 'Júnior' },
  ],
  incompatible: false,
  scorePending: false,
  repost: null,
  alsoOn: [],
  availability: { state: null, reason: null, closedAt: null, checkedAt: null, deadline: null },
  ...overrides,
});

export const preferences = (configured = true): PreferencesDto => ({
  stacksCore: configured ? ['node.js'] : [],
  stacksPlus: [],
  stacksAvoid: [],
  seniorities: [],
  workModels: [],
  cities: [],
  contractTypes: [],
  maxAgeDays: null,
  minMonthlySalary: null,
  blockedCompanies: [],
  configured,
  version: 1,
  updatedAt: null,
  unknownStacks: [],
});

/** O que o layout (menu, rodapé, faixa) busca em toda tela. */
export const layoutRoutes = () => ({
  'GET /health': () => healthy,
  'GET /jobs/counts': () => counts(),
  'GET /applications/summary': () => summary(),
  'GET /discovery/sources': () => [source(), inactiveBoard()],
  'GET /preferences': () => preferences(),
});

export const application = (
  overrides: Partial<ApplicationDetailDto> = {},
): ApplicationDetailDto => ({
  id: 'app-1',
  jobId: 'job-1',
  status: 'applied',
  appliedAt: '2026-10-04T13:00:00.000Z',
  appliedVia: null,
  salaryExpectation: null,
  notes: null,
  nextStepAt: null,
  nextStepNote: null,
  createdAt: '2026-10-04T13:00:00.000Z',
  updatedAt: '2026-10-04T13:00:00.000Z',
  job: {
    id: 'job-1',
    title: 'Back-end Jr (NestJS)',
    company: 'Lumen Saúde',
    url: 'https://lumen.example/vaga',
    location: null,
    workModel: 'remote',
  },
  events: [
    {
      id: 'ev-1',
      status: 'applied',
      previousStatus: null,
      occurredAt: '2026-10-04T13:00:00.000Z',
      note: 'Pela Gupy.',
      createdAt: '2026-10-04T13:00:00.000Z',
    },
  ],
  resume: null,
  resumeFile: null,
  ...overrides,
});

const section = (
  id: string,
  title: string,
  kind: ResumeSectionKind,
  position: number,
  items: [string, ResumeItemData][],
): ResumeSectionDto => ({
  id,
  title,
  kind,
  position,
  items: items.map(([itemId, data], index) => ({ id: itemId, position: index, data })),
});

/** Currículo com uma seção de cada tipo e os campos que o PDF esconde. */
export const resume = (): ResumeDto => ({
  sections: [
    section('s-dados', 'Dados pessoais', 'fields', 0, [
      ['i-nome', { label: 'Nome completo', value: 'Ana Souza' }],
      ['i-nasc', { label: 'Data de nascimento', value: '01/02/2000' }],
      ['i-cidade', { label: 'Cidade/UF', value: 'Americana/SP' }],
    ]),
    section('s-contato', 'Contato', 'fields', 1, [
      ['i-email', { label: 'E-mail', value: 'ana@email.com' }],
      ['i-tel', { label: 'Telefone/WhatsApp', value: '' }],
    ]),
    section('s-resumo', 'Resumo profissional', 'text', 2, [
      ['i-resumo', { text: 'Dev full stack júnior.' }],
    ]),
    section('s-exp', 'Experiência', 'entries', 3, [
      [
        'i-exp',
        {
          title: 'Desenvolvedora Jr',
          organization: 'Lumen',
          location: 'Remoto',
          startDate: '2025-01',
          endDate: null,
          current: true,
          description: 'APIs em NestJS.',
        },
      ],
    ]),
    section('s-comp', 'Competências', 'fields', 4, [
      ['i-ling', { label: 'Linguagens', value: 'TypeScript, Java' }],
    ]),
    section('s-resp', 'Respostas prontas', 'fields', 5, [
      ['i-pret', { label: 'Pretensão salarial (CLT)', value: 'R$ 4.000' }],
      ['i-disp', { label: 'Disponibilidade para início', value: 'Imediata' }],
    ]),
  ],
});

/** Painel do Início: 14 dias terminando hoje (data local), com pico no dia 10. */
export const dashboard = (overrides: Partial<DashboardDto> = {}): DashboardDto => {
  const counts = [1, 0, 3, 4, 3, 2, 1, 3, 4, 1, 9, 2, 5, 2];
  const today = new Date();
  return {
    newJobsPerDay: counts.map((count, index) => {
      const day = new Date(today);
      day.setDate(today.getDate() - (counts.length - 1 - index));
      const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      return { date: iso, count };
    }),
    newLast24h: 2,
    highScoreInbox: 6,
    topNew: [job()],
    upcomingSteps: [
      application({
        status: 'in_process',
        nextStepAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        nextStepNote: 'Entrevista técnica',
      }),
    ],
    stepsNextDays: 2,
    savedClosed: 0,
    funnel: { applied: 9, inProcess: 3, offer: 1 },
    medianDaysToFirstResponse: 4.5,
    ...overrides,
  };
};
