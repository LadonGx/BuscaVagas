import type { PreferencesDto } from '@busca-vagas/shared';
import { useQuery } from '@tanstack/react-query';
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
