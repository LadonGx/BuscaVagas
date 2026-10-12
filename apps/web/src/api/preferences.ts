import type {
  PreferencesDto,
  PreferencesValues,
  PutPreferencesResultDto,
  StackOptionDto,
} from '@busca-vagas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { keys } from './keys';

export function usePreferences() {
  return useQuery({
    queryKey: keys.preferences,
    queryFn: ({ signal }) => api.get<PreferencesDto>('/preferences', undefined, signal),
  });
}

/** `undefined` enquanto carrega; depois, se há preferências (= há nota). */
export function usePreferencesConfigured(): boolean | undefined {
  return usePreferences().data?.configured;
}

/** Tecnologias que o detector conhece + as que aparecem nas vagas, com a contagem. */
export function useStackOptions() {
  return useQuery({
    queryKey: keys.stackOptions,
    queryFn: ({ signal }) => api.get<StackOptionDto[]>('/preferences/stacks', undefined, signal),
    staleTime: 5 * 60_000,
  });
}

/**
 * `PUT /preferences`: substitui tudo e manda recalcular as notas em segundo
 * plano. As contagens mudam na hora (as notas viram "na fila").
 */
export function useSavePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: PreferencesValues) =>
      api.put<PutPreferencesResultDto>('/preferences', values),
    onSuccess: ({ rescoreQueued: _queued, ...saved }) => {
      queryClient.setQueryData<PreferencesDto>(keys.preferences, saved);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.jobs.all }),
        queryClient.invalidateQueries({ queryKey: keys.dashboard }),
      ]);
    },
  });
}
