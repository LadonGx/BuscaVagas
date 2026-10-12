import type { DashboardDto } from '@busca-vagas/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import { keys } from './keys';

/** O painel do Início numa requisição só. */
export function useDashboard() {
  return useQuery({
    queryKey: keys.dashboard,
    queryFn: ({ signal }) => api.get<DashboardDto>('/dashboard', undefined, signal),
  });
}
