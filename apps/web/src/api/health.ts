import { useQuery } from '@tanstack/react-query';
import { ApiError, apiRequest } from './client';
import { keys } from './keys';

export type CheckStatus = 'up' | 'down';

export interface HealthReport {
  status: 'ok' | 'degraded';
  checks: { database: CheckStatus; redis: CheckStatus };
  uptimeSeconds: number;
}

function isReport(body: unknown): body is HealthReport {
  return Boolean(body && typeof body === 'object' && 'checks' in body);
}

/** 503 também traz o relatório no corpo (diz quem caiu). */
async function fetchHealth(signal?: AbortSignal): Promise<HealthReport> {
  try {
    return await apiRequest<HealthReport>('/health', { signal });
  } catch (error) {
    if (error instanceof ApiError && error.status === 503 && isReport(error.body)) {
      return error.body;
    }
    throw error;
  }
}

/** Fica checando a API: mais rápido enquanto ela está fora. */
export function useHealth() {
  return useQuery({
    queryKey: keys.health,
    queryFn: ({ signal }) => fetchHealth(signal),
    retry: false,
    refetchInterval: (query) =>
      query.state.status === 'error' || query.state.data?.status === 'degraded' ? 5_000 : 30_000,
  });
}
