import type {
  ApplicationSummaryDto,
  JobCountsDto,
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
