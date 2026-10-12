import type { ApplicationSummaryDto, JobCountsDto } from '@busca-vagas/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import { keys } from './keys';

/**
 * Contagens de vagas: menu e prévia das preferências. Com
 * `pollWhilePending`, confere a cada 3 s enquanto houver nota na fila
 * (ex.: recálculo depois de salvar as preferências).
 */
export function useJobCounts({ pollWhilePending = false } = {}) {
  return useQuery({
    queryKey: keys.jobs.counts,
    queryFn: ({ signal }) => api.get<JobCountsDto>('/jobs/counts', undefined, signal),
    refetchInterval: (query) =>
      pollWhilePending && (query.state.data?.score.pending ?? 0) > 0 ? 3_000 : false,
  });
}

/** Candidaturas por status. */
export function useApplicationSummary() {
  return useQuery({
    queryKey: keys.applications.summary,
    queryFn: ({ signal }) =>
      api.get<ApplicationSummaryDto>('/applications/summary', undefined, signal),
  });
}

/** Em andamento = ainda não recusada nem desistida. */
export function activeApplications(summary: ApplicationSummaryDto): number {
  return summary.applied + summary.in_process + summary.offer;
}
