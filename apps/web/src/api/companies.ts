import type {
  AddCompanyInput,
  AddCompanyResultDto,
  CompanyDirectoryDto,
  TrackedCompanyDto,
  UpdateCompanyInput,
} from '@busca-vagas/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from './client';
import { invalidateAfterScan } from './discovery';
import { keys } from './keys';

/** Empresas acompanhadas nos boards (Greenhouse, Lever, Ashby). */
export function useCompanies(enabled = true) {
  return useQuery({
    queryKey: keys.companies.list,
    queryFn: ({ signal }) => api.get<TrackedCompanyDto[]>('/companies', undefined, signal),
    enabled,
  });
}

/** Diretório de empresas verificadas; `trackedId` marca as que já estão na lista. */
export function useCompanyDirectory(enabled = true) {
  return useQuery({
    queryKey: keys.companies.directory,
    queryFn: ({ signal }) =>
      api.get<CompanyDirectoryDto>('/companies/directory', undefined, signal),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** Lista, diretório e a contagem de empresas em cada fonte. */
function invalidateCompanies(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.companies.all }),
    queryClient.invalidateQueries({ queryKey: keys.discovery.sources }),
  ]);
}

/** Confere o board e adiciona; as vagas lidas já entram (recarrega as listas). */
export function useAddCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddCompanyInput) => api.post<AddCompanyResultDto>('/companies', input),
    onSuccess: async (result) => {
      await invalidateCompanies(queryClient);
      if (result.jobsNew > 0) await invalidateAfterScan(queryClient);
    },
  });
}

/** Liga/desliga ou renomeia. A troca aparece na hora; erro volta como estava. */
export function useUpdateCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateCompanyInput & { id: string }) =>
      api.patch<TrackedCompanyDto>(`/companies/${id}`, input),
    onMutate: async ({ id, ...input }) => {
      await queryClient.cancelQueries({ queryKey: keys.companies.list });
      const previous = queryClient.getQueryData<TrackedCompanyDto[]>(keys.companies.list);
      queryClient.setQueryData<TrackedCompanyDto[]>(keys.companies.list, (list) =>
        list?.map((company) =>
          company.id === id
            ? { ...company, ...(input.active !== undefined && { active: input.active }) }
            : company,
        ),
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(keys.companies.list, context.previous);
    },
    onSettled: () => invalidateCompanies(queryClient),
  });
}

export function useRemoveCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/companies/${id}`),
    onSuccess: () => invalidateCompanies(queryClient),
  });
}

/** Lê o board de uma empresa da lista agora. */
export function useRecheckCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<TrackedCompanyDto>(`/companies/${id}/check`),
    onSuccess: (company) => {
      queryClient.setQueryData<TrackedCompanyDto[]>(keys.companies.list, (list) =>
        list?.map((item) => (item.id === company.id ? company : item)),
      );
    },
  });
}
