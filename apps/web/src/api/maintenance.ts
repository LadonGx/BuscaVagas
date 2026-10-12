import type { RetentionReportDto } from '@busca-vagas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { keys } from './keys';

/** Prévia da próxima limpeza (nada é apagado). */
export function useRetention() {
  return useQuery({
    queryKey: keys.retention,
    queryFn: ({ signal }) =>
      api.get<RetentionReportDto>('/maintenance/retention', undefined, signal),
  });
}

/** Roda a limpeza agora. Apaga de verdade: a tela pede confirmação antes. */
export function useRunRetention() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<RetentionReportDto>('/maintenance/retention'),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.retention }),
        queryClient.invalidateQueries({ queryKey: keys.jobs.all }),
        queryClient.invalidateQueries({ queryKey: keys.dashboard }),
        queryClient.invalidateQueries({ queryKey: ['discovery', 'runs'] }),
      ]),
  });
}
