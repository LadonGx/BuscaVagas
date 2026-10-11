import { MANUAL_SOURCE, type ScanResultDto, type SourceInfoDto } from '@busca-vagas/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api } from './client';
import { keys } from './keys';

/** Enquanto alguma fonte roda, confere a cada 3 s; parada, a cada minuto. */
const POLL_RUNNING_MS = 3_000;
const POLL_IDLE_MS = 60_000;

export function useSources() {
  return useQuery({
    queryKey: keys.discovery.sources,
    queryFn: ({ signal }) => api.get<SourceInfoDto[]>('/discovery/sources', undefined, signal),
    refetchInterval: (query) =>
      query.state.data?.some((source) => source.running) ? POLL_RUNNING_MS : POLL_IDLE_MS,
  });
}

/** Nome de exibição da fonte de uma vaga ("gupy" → "Gupy"; manual → "cadastro manual"). */
export function useSourceName(): (sourceId: string) => string {
  const { data: sources } = useSources();
  return (sourceId) => {
    if (sourceId === MANUAL_SOURCE) return 'cadastro manual';
    return (
      sources?.find((source) => source.id === sourceId)?.displayName ??
      sourceId.charAt(0).toUpperCase() + sourceId.slice(1)
    );
  };
}

export function isScanning(sources: readonly SourceInfoDto[] | undefined): boolean {
  return Boolean(sources?.some((source) => source.running));
}

/** Vagas novas mudam listas, contagens e o painel. */
export function invalidateAfterScan(queryClient: QueryClient): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.jobs.all }),
    queryClient.invalidateQueries({ queryKey: keys.dashboard }),
    queryClient.invalidateQueries({ queryKey: keys.discovery.sources }),
  ]);
}

/**
 * Observa as fontes e, quando a busca termina (alguma rodando → nenhuma),
 * recarrega o que depende das vagas. Fica montado uma vez, no layout.
 */
export function useRefreshWhenScanEnds(sources: readonly SourceInfoDto[] | undefined): void {
  const queryClient = useQueryClient();
  const wasScanning = useRef(false);
  const scanning = isScanning(sources);

  useEffect(() => {
    if (wasScanning.current && !scanning) {
      void invalidateAfterScan(queryClient);
    }
    wasScanning.current = scanning;
  }, [scanning, queryClient]);
}

export function useScan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ScanResultDto>('/discovery/scan'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.discovery.sources }),
  });
}

const listFormat = new Intl.ListFormat('pt-BR', { type: 'conjunction' });

/**
 * Resumo curto do "Buscar agora": onde está buscando e quais fontes estão
 * desligadas. O motivo de cada uma fica em Preferências → Fontes — repetir
 * aqui deixava o aviso enorme com várias fontes paradas.
 */
export function describeScan(
  result: ScanResultDto,
  sources: readonly SourceInfoDto[] = [],
): string {
  // Sem a lista de fontes carregada, "gupy" vira "Gupy".
  const name = (id: string) =>
    sources.find((source) => source.id === id)?.displayName ??
    id.charAt(0).toUpperCase() + id.slice(1);
  const parts: string[] = [];

  const started = [...result.queued.map((q) => q.sourceId), ...result.alreadyQueued];
  parts.push(
    started.length > 0
      ? `Buscando em ${listFormat.format(started.map(name))}.`
      : 'Nenhuma fonte ativa para buscar.',
  );

  if (result.inactive.length > 0) {
    const names = listFormat.format(result.inactive.map((inactive) => name(inactive.sourceId)));
    const verb = result.inactive.length === 1 ? 'está desligada' : 'estão desligadas';
    parts.push(`${names} ${verb} (o motivo aparece em Preferências → Fontes).`);
  }
  return parts.join(' ');
}
