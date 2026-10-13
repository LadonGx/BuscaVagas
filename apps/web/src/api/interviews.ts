import type {
  CreateInterviewQuestionInput,
  InterviewQuestionDto,
  PracticeRating,
  UpdateInterviewQuestionInput,
} from '@busca-vagas/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from './client';
import { keys } from './keys';

/**
 * Perguntas de entrevista (docs/features/15-interview-questions.md). A lista
 * inteira vem de uma vez; cada mudança troca a pergunta na lista, sem recarregar.
 */
export function useInterviewQuestions() {
  return useQuery({
    queryKey: keys.interviews,
    queryFn: ({ signal }) =>
      api.get<InterviewQuestionDto[]>('/interview-questions', undefined, signal),
  });
}

function replaceQuestion(queryClient: QueryClient, updated: InterviewQuestionDto) {
  queryClient.setQueryData<InterviewQuestionDto[]>(keys.interviews, (list) => {
    if (!list) return list;
    return list.some((item) => item.id === updated.id)
      ? list.map((item) => (item.id === updated.id ? updated : item))
      : [...list, updated];
  });
}

export function useCreateQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInterviewQuestionInput) =>
      api.post<InterviewQuestionDto>('/interview-questions', input),
    onSuccess: (created) => replaceQuestion(queryClient, created),
  });
}

export function useUpdateQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateInterviewQuestionInput }) =>
      api.patch<InterviewQuestionDto>(`/interview-questions/${id}`, input),
    onSuccess: (updated) => replaceQuestion(queryClient, updated),
  });
}

export function useDeleteQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/interview-questions/${id}`),
    onSuccess: (_result, id) =>
      queryClient.setQueryData<InterviewQuestionDto[]>(keys.interviews, (list) =>
        list?.filter((item) => item.id !== id),
      ),
  });
}

/** Treino: "fui bem" / "preciso treinar". */
export function usePractice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rating }: { id: string; rating: PracticeRating }) =>
      api.post<InterviewQuestionDto>(`/interview-questions/${id}/practice`, { rating }),
    onSuccess: (updated) => replaceQuestion(queryClient, updated),
  });
}

/** "Caiu nesta entrevista" (de novo = troca a anotação). */
export function useMarkAsked() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      applicationId,
      note,
    }: {
      id: string;
      applicationId: string;
      note?: string | null;
    }) =>
      api.put<InterviewQuestionDto>(`/interview-questions/${id}/asked/${applicationId}`, { note }),
    onSuccess: (updated) => replaceQuestion(queryClient, updated),
  });
}

export function useUnmarkAsked() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, applicationId }: { id: string; applicationId: string }) =>
      api.delete<InterviewQuestionDto>(`/interview-questions/${id}/asked/${applicationId}`),
    onSuccess: (updated) => replaceQuestion(queryClient, updated),
  });
}
