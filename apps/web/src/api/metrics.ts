import type { MetricsDto, MetricsPeriod } from '@busca-vagas/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from './client';
import { keys } from './keys';

/** Métricas do período (docs/features/17-metrics.md). Trocar o período mantém a tela até chegar o novo. */
export function useMetrics(days: MetricsPeriod) {
  return useQuery({
    queryKey: keys.metrics(days),
    queryFn: ({ signal }) => api.get<MetricsDto>('/metrics', { days }, signal),
    placeholderData: keepPreviousData,
  });
}
