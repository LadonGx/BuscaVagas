import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './client';

/**
 * Erro 4xx não melhora tentando de novo; API fora do ar e 5xx tentam mais
 * uma vez. O dado vale 15 s antes de ser buscado de novo ao voltar à tela.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status < 500) && failureCount < 1,
      },
      mutations: { retry: false },
    },
  });
}
