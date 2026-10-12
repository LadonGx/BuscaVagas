import type {
  ApplicationDetailDto,
  ApplicationSummaryDto,
  JobCountsDto,
  JobDto,
  SourceInfoDto,
  SourceRunDto,
} from '@busca-vagas/shared';

export const counts = (overrides: Partial<JobCountsDto> = {}): JobCountsDto => ({
  triage: { inbox: 142, saved: 18, dismissed: 25 },
  withApplication: 9,
  score: { great: 42, good: 61, weak: 20, incompatible: 18, pending: 0, unscored: 1 },
  swipeable: 87,
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
    reason: 'GREENHOUSE_COMPANIES vazio — nenhuma empresa para buscar',
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
  ...overrides,
});

export const preferences = (configured = true) => ({
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
  ...overrides,
});
