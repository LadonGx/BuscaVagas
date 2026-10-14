/**
 * Chaves do TanStack Query num lugar só. Invalidar `['jobs']` atualiza toda
 * listagem, detalhe e contagem de vagas de uma vez.
 */
export const keys = {
  health: ['health'] as const,
  jobs: {
    all: ['jobs'] as const,
    counts: ['jobs', 'counts'] as const,
    lists: ['jobs', 'list'] as const,
    list: (filters: object) => ['jobs', 'list', filters] as const,
    detail: (id: string) => ['jobs', 'detail', id] as const,
    history: (id: string) => ['jobs', 'history', id] as const,
  },
  applications: {
    all: ['applications'] as const,
    summary: ['applications', 'summary'] as const,
    list: ['applications', 'list'] as const,
    detail: (id: string) => ['applications', 'detail', id] as const,
    resume: (id: string) => ['applications', 'resume', id] as const,
  },
  discovery: {
    sources: ['discovery', 'sources'] as const,
    runs: (sourceId: string | null) => ['discovery', 'runs', sourceId ?? 'todas'] as const,
  },
  companies: {
    all: ['companies'] as const,
    list: ['companies', 'list'] as const,
    directory: ['companies', 'directory'] as const,
  },
  retention: ['maintenance', 'retention'] as const,
  dashboard: ['dashboard'] as const,
  preferences: ['preferences'] as const,
  stackOptions: ['preferences', 'stacks'] as const,
  resume: ['resume'] as const,
  interviews: ['interview-questions'] as const,
  notifications: ['notifications'] as const,
  metrics: (days: number) => ['metrics', days] as const,
  notificationSettings: ['notifications', 'settings'] as const,
  resumeStacks: ['resume', 'stacks'] as const,
};
