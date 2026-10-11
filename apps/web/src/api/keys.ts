/**
 * Chaves do TanStack Query num lugar só. Invalidar `['jobs']` atualiza toda
 * listagem, detalhe e contagem de vagas de uma vez.
 */
export const keys = {
  health: ['health'] as const,
  jobs: {
    all: ['jobs'] as const,
    counts: ['jobs', 'counts'] as const,
  },
  applications: {
    all: ['applications'] as const,
    summary: ['applications', 'summary'] as const,
  },
  discovery: {
    sources: ['discovery', 'sources'] as const,
  },
  dashboard: ['dashboard'] as const,
};
