import type {
  AddStatusEventInput,
  ApplicationDetailDto,
  ApplicationDto,
  ApplicationStatus,
  Page,
  UpdateApplicationInput,
} from '@busca-vagas/shared';
import { MAX_PAGE_LIMIT } from '@busca-vagas/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from './client';
import { keys } from './keys';

/** Limite de segurança: o quadro carrega tudo, até isto. */
const MAX_PAGES = 20;

/**
 * Todas as candidaturas de uma vez (são dezenas, não milhares): o quadro
 * precisa de todas para montar as colunas.
 */
async function fetchAllApplications(signal?: AbortSignal): Promise<ApplicationDto[]> {
  const all: ApplicationDto[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await api.get<Page<ApplicationDto>>(
      '/applications',
      { limit: MAX_PAGE_LIMIT, cursor },
      signal,
    );
    all.push(...result.items);
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return all;
}

export function useApplications() {
  return useQuery({
    queryKey: keys.applications.list,
    queryFn: ({ signal }) => fetchAllApplications(signal),
  });
}

export function useApplication(id: string | null) {
  return useQuery({
    queryKey: keys.applications.detail(id ?? ''),
    queryFn: ({ signal }) =>
      api.get<ApplicationDetailDto>(`/applications/${id}`, undefined, signal),
    enabled: Boolean(id),
  });
}

/** Depois de mexer numa candidatura: quadro, contagens, painel e vagas. */
function refreshAfterChange(queryClient: QueryClient, detail?: ApplicationDetailDto) {
  if (detail) queryClient.setQueryData(keys.applications.detail(detail.id), detail);
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.applications.all }),
    queryClient.invalidateQueries({ queryKey: keys.jobs.all }),
    queryClient.invalidateQueries({ queryKey: keys.dashboard }),
  ]);
}

/**
 * Mudar de coluna = registrar um evento de status com a data de agora.
 * Otimista no quadro: o cartão muda de coluna na hora.
 */
export function useMoveApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ApplicationStatus }) =>
      api.post<ApplicationDetailDto>(`/applications/${id}/events`, { status }),

    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: keys.applications.list });
      const previous = queryClient.getQueryData<ApplicationDto[]>(keys.applications.list);
      queryClient.setQueryData<ApplicationDto[]>(keys.applications.list, (list) =>
        list?.map((item) =>
          item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item,
        ),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(keys.applications.list, context.previous);
    },
    onSuccess: (detail) => refreshAfterChange(queryClient, detail),
  });
}

/** O evento mais recentemente registrado (o que acabou de ser criado). */
export function newestEventId(detail: ApplicationDetailDto): string | undefined {
  return [...detail.events].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1)?.id;
}

export function useAddEvent(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddStatusEventInput) =>
      api.post<ApplicationDetailDto>(`/applications/${id}/events`, input),
    onSuccess: (detail) => refreshAfterChange(queryClient, detail),
  });
}

export function useUpdateEvent(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, ...input }: { eventId: string } & Partial<AddStatusEventInput>) =>
      api.patch<ApplicationDetailDto>(`/applications/${id}/events/${eventId}`, input),
    onSuccess: (detail) => refreshAfterChange(queryClient, detail),
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, eventId }: { id: string; eventId: string }) =>
      api.delete<ApplicationDetailDto>(`/applications/${id}/events/${eventId}`),
    onSuccess: (detail) => refreshAfterChange(queryClient, detail),
  });
}

export function useUpdateApplication(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateApplicationInput) =>
      api.patch<ApplicationDetailDto>(`/applications/${id}`, input),
    onSuccess: (detail) => refreshAfterChange(queryClient, detail),
  });
}

export function useDeleteApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/applications/${id}`),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: keys.applications.detail(id) });
      return refreshAfterChange(queryClient);
    },
  });
}
