import type {
  CreateResumeSectionInput,
  ResumeDto,
  ResumeItemData,
  ResumeItemDto,
  ResumeSectionDto,
} from '@busca-vagas/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from './client';
import { keys } from './keys';

/**
 * Currículo. O conteúdo dos itens é salvo só pelo botão "Salvar"
 * (`useSaveItems`); a estrutura (criar, apagar, renomear, ordenar) vai para a
 * API na hora. Toda resposta atualiza o cache direto, sem buscar de novo.
 */
export function useResume() {
  return useQuery({
    queryKey: keys.resume,
    queryFn: ({ signal }) => api.get<ResumeDto>('/resume', undefined, signal),
  });
}

function setResume(queryClient: QueryClient, update: (resume: ResumeDto) => ResumeDto) {
  queryClient.setQueryData<ResumeDto>(keys.resume, (resume) => resume && update(resume));
}

function mapSection(
  resume: ResumeDto,
  id: string,
  update: (section: ResumeSectionDto) => ResumeSectionDto,
): ResumeDto {
  return {
    sections: resume.sections.map((section) => (section.id === id ? update(section) : section)),
  };
}

/** Os mesmos itens numa nova ordem, com `position` refeita. */
function reorder<T extends { id: string; position: number }>(list: T[], ids: string[]): T[] {
  const byId = new Map(list.map((entry) => [entry.id, entry]));
  return ids.flatMap((id, position) => {
    const entry = byId.get(id);
    return entry ? [{ ...entry, position }] : [];
  });
}

/* ------------------------------------------------------------ seções */

export function useCreateSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateResumeSectionInput) =>
      api.post<ResumeSectionDto>('/resume/sections', input),
    onSuccess: (section) =>
      setResume(queryClient, (resume) => ({ sections: [...resume.sections, section] })),
  });
}

export function useRenameSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api.patch<ResumeSectionDto>(`/resume/sections/${id}`, { title }),
    onSuccess: (section) =>
      setResume(queryClient, (resume) =>
        mapSection(resume, section.id, (current) => ({ ...current, title: section.title })),
      ),
  });
}

export function useDeleteSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/resume/sections/${id}`),
    onSuccess: (_data, id) =>
      setResume(queryClient, (resume) => ({
        sections: resume.sections.filter((section) => section.id !== id),
      })),
  });
}

/** Otimista: a seção troca de lugar na hora e volta se a API recusar. */
export function useReorderSections() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.put<ResumeDto>('/resume/sections/order', { ids }),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: keys.resume });
      const previous = queryClient.getQueryData<ResumeDto>(keys.resume);
      setResume(queryClient, (resume) => ({ sections: reorder(resume.sections, ids) }));
      return { previous };
    },
    onError: (_error, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(keys.resume, context.previous);
    },
    onSuccess: (resume) => queryClient.setQueryData(keys.resume, resume),
  });
}

/* ------------------------------------------------------------- itens */

export function useAddItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sectionId, data }: { sectionId: string; data: ResumeItemData }) =>
      api.post<ResumeItemDto>(`/resume/sections/${sectionId}/items`, { data }),
    onSuccess: (item, { sectionId }) =>
      setResume(queryClient, (resume) =>
        mapSection(resume, sectionId, (section) => ({
          ...section,
          items: [...section.items, item],
        })),
      ),
  });
}

export function useDeleteItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/resume/items/${id}`),
    onSuccess: (_data, id) =>
      setResume(queryClient, (resume) => ({
        sections: resume.sections.map((section) => ({
          ...section,
          items: section.items.filter((item) => item.id !== id),
        })),
      })),
  });
}

/** Otimista, como a ordem das seções. */
export function useReorderItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sectionId, ids }: { sectionId: string; ids: string[] }) =>
      api.put<ResumeSectionDto>(`/resume/sections/${sectionId}/items/order`, { ids }),
    onMutate: async ({ sectionId, ids }) => {
      await queryClient.cancelQueries({ queryKey: keys.resume });
      const previous = queryClient.getQueryData<ResumeDto>(keys.resume);
      setResume(queryClient, (resume) =>
        mapSection(resume, sectionId, (section) => ({
          ...section,
          items: reorder(section.items, ids),
        })),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(keys.resume, context.previous);
    },
    onSuccess: (section) =>
      setResume(queryClient, (resume) => mapSection(resume, section.id, () => section)),
  });
}

/* ---------------------------------------------------------- salvar */

export interface ItemChange {
  id: string;
  data: ResumeItemData;
}

export interface SaveResult {
  saved: ResumeItemDto[];
  failed: { id: string; error: Error }[];
}

/**
 * Salva os itens alterados, um de cada vez. Um item recusado não para os
 * outros: o resultado diz quais foram e quais falharam. Cada item salvo já
 * entra no cache, então o que deu certo não se perde se o resto falhar.
 */
export function useSaveItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (changes: ItemChange[]): Promise<SaveResult> => {
      const result: SaveResult = { saved: [], failed: [] };
      for (const { id, data } of changes) {
        try {
          const item = await api.patch<ResumeItemDto>(`/resume/items/${id}`, { data });
          result.saved.push(item);
          setResume(queryClient, (resume) => ({
            sections: resume.sections.map((section) => ({
              ...section,
              items: section.items.map((current) => (current.id === item.id ? item : current)),
            })),
          }));
        } catch (error) {
          result.failed.push({ id, error: error as Error });
        }
      }
      return result;
    },
  });
}
