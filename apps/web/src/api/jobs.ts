import {
  EMAIL_ALERT_SITES,
  type ApplicationDetailDto,
  type CreateJobInput,
  type JobDto,
  type JobHistoryDto,
  type JobSort,
  type Page,
  type TriageStatus,
  type WorkModel,
} from '@busca-vagas/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { api } from './client';
import { keys } from './keys';

/** Abas da tela de Vagas. "Com candidatura" não é triagem: é `hasApplication`. */
export const JOB_TABS = ['inbox', 'saved', 'applied', 'dismissed'] as const;
export type JobTab = (typeof JOB_TABS)[number];

export interface JobFilters {
  tab: JobTab;
  q?: string;
  workModel?: WorkModel[];
  minScore?: number;
  sort?: JobSort;
  hideIncompatible?: boolean;
  /** Esconde as encerradas (salvas e com candidatura ficam). Padrão da tela: ligado. */
  hideClosed?: boolean;
  /**
   * De onde veio a vaga: o id de uma fonte ("gupy", "linkedin", "manual"),
   * `SOURCE_EMAIL` (os alertas por e-mail juntos) ou `SOURCE_NOT_EMAIL`.
   */
  source?: string;
}

/** Filtro de fonte: os três sites dos alertas por e-mail juntos. */
export const SOURCE_EMAIL = 'email';
/** Filtro de fonte: tudo menos os alertas por e-mail. */
export const SOURCE_NOT_EMAIL = 'sem-email';
const EMAIL_SITES = Object.keys(EMAIL_ALERT_SITES);

function sourceQuery(source: string | undefined) {
  if (!source) return {};
  if (source === SOURCE_EMAIL) return { source: EMAIL_SITES };
  if (source === SOURCE_NOT_EMAIL) return { excludeSource: EMAIL_SITES };
  return { source: [source] };
}

export const PAGE_SIZE = 30;
/** Enquanto alguma vaga da tela está com a nota na fila, confere a cada 3 s. */
const POLL_PENDING_MS = 3_000;

/** Filtros da tela → query string de `GET /api/jobs`. */
export function jobListQuery(filters: JobFilters) {
  const { tab } = filters;
  return {
    triage: tab === 'applied' ? undefined : [tab],
    hasApplication: tab === 'applied' ? true : undefined,
    q: filters.q || undefined,
    workModel: filters.workModel,
    minScore: filters.minScore,
    sort: filters.sort,
    hideIncompatible: filters.hideIncompatible || undefined,
    hideClosed: filters.hideClosed || undefined,
    ...sourceQuery(filters.source),
    limit: PAGE_SIZE,
  };
}

/** A vaga continua cabendo nesta aba depois de mudar a triagem? */
export function fitsTab(job: Pick<JobDto, 'triage' | 'application'>, tab: JobTab): boolean {
  return tab === 'applied' ? job.application !== null : job.triage === tab;
}

type JobPages = InfiniteData<Page<JobDto>, string | null>;

export function useJobList(filters: JobFilters) {
  return useInfiniteQuery({
    queryKey: keys.jobs.list(filters),
    queryFn: ({ pageParam, signal }) =>
      api.get<Page<JobDto>>(
        '/jobs',
        { ...jobListQuery(filters), cursor: pageParam ?? undefined },
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) => page.items.some((job) => job.scorePending))
        ? POLL_PENDING_MS
        : false,
  });
}

export function useJob(id: string | null, placeholder?: JobDto) {
  return useQuery({
    queryKey: keys.jobs.detail(id ?? ''),
    queryFn: ({ signal }) => api.get<JobDto>(`/jobs/${id}`, undefined, signal),
    enabled: Boolean(id),
    placeholderData: placeholder,
  });
}

/** Procura a vaga nas listas já carregadas (abre o painel sem esperar a API). */
export function findLoadedJob(queryClient: QueryClient, id: string): JobDto | undefined {
  for (const [, data] of queryClient.getQueriesData<JobPages>({ queryKey: keys.jobs.lists })) {
    const found = data?.pages.flatMap((page) => page.items).find((job) => job.id === id);
    if (found) return found;
  }
  return queryClient.getQueryData<JobDto>(keys.jobs.detail(id));
}

interface TriageVariables {
  job: JobDto;
  status: TriageStatus;
  reason?: string | null;
}

/**
 * Salvar, descartar ou voltar para a caixa. Otimista: a vaga muda (ou sai da
 * aba) na hora; se a API recusar, tudo volta como estava.
 */
export function useTriage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ job, status, reason }: TriageVariables) =>
      api.put<JobDto>(`/jobs/${job.id}/triage`, {
        status,
        reason: status === 'dismissed' ? (reason ?? null) : undefined,
      }),

    onMutate: async ({ job, status, reason }) => {
      await queryClient.cancelQueries({ queryKey: keys.jobs.lists });
      const lists = queryClient.getQueriesData<JobPages>({ queryKey: keys.jobs.lists });
      const detail = queryClient.getQueryData<JobDto>(keys.jobs.detail(job.id));
      const changed: JobDto = {
        ...job,
        triage: status,
        dismissReason: status === 'dismissed' ? (reason ?? null) : null,
      };

      for (const [key, data] of lists) {
        if (!data) continue;
        const filters = key[2] as JobFilters;
        queryClient.setQueryData<JobPages>(key, {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items
              .map((item) => (item.id === job.id ? changed : item))
              .filter((item) => item.id !== job.id || fitsTab(item, filters.tab)),
          })),
        });
      }
      if (detail) queryClient.setQueryData(keys.jobs.detail(job.id), changed);

      return { lists, detail };
    },

    onError: (_error, { job }, context) => {
      for (const [key, data] of context?.lists ?? []) queryClient.setQueryData(key, data);
      if (context?.detail) queryClient.setQueryData(keys.jobs.detail(job.id), context.detail);
    },

    onSuccess: (updated) => {
      queryClient.setQueryData(keys.jobs.detail(updated.id), updated);
    },

    // Contagens do menu e as outras abas: a API manda.
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.jobs.all }),
  });
}

export function useCreateJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateJobInput) => api.post<JobDto>('/jobs', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.jobs.all }),
  });
}

/** "Me candidatei": cria a candidatura (a API também marca a vaga como salva). */
export function useApply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => api.post<ApplicationDetailDto>('/applications', { jobId }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.jobs.all }),
        queryClient.invalidateQueries({ queryKey: keys.applications.all }),
        queryClient.invalidateQueries({ queryKey: keys.dashboard }),
      ]),
  });
}

/** As outras vezes em que a vaga apareceu e se as repostagens estão silenciadas. */
export function useJobHistory(id: string, enabled = true) {
  return useQuery({
    queryKey: keys.jobs.history(id),
    queryFn: ({ signal }) => api.get<JobHistoryDto>(`/jobs/${id}/history`, undefined, signal),
    enabled,
  });
}

/** "Descartar sozinha se for repostada" (liga/desliga). */
export function useMuteReposts(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (muted: boolean) => api.put<JobHistoryDto>(`/jobs/${id}/reposts`, { muted }),
    onSuccess: (history) => queryClient.setQueryData(keys.jobs.history(id), history),
  });
}

/**
 * "Conferir se ainda está aberta" (docs/features/13-availability.md). A vaga
 * muda no painel e nas listas na hora; contagens, listas e o Início são
 * recarregados da API.
 */
export function useCheckJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<JobDto>(`/jobs/${id}/check`),
    onSuccess: async (updated) => {
      queryClient.setQueryData(keys.jobs.detail(updated.id), updated);
      for (const [key, data] of queryClient.getQueriesData<JobPages>({
        queryKey: keys.jobs.lists,
      })) {
        if (!data) continue;
        queryClient.setQueryData<JobPages>(key, {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((item) => (item.id === updated.id ? updated : item)),
          })),
        });
      }
      // A vaga pode ter fechado: as contagens e as listas que escondem as
      // fechadas mudam; quem decide é a API.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.jobs.counts }),
        queryClient.invalidateQueries({ queryKey: keys.jobs.lists }),
        queryClient.invalidateQueries({ queryKey: keys.dashboard }),
      ]);
    },
  });
}
