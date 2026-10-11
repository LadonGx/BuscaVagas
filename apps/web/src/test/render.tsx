import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { ToastProvider } from '../components/toast/ToastProvider';
import { routes as appRoutes } from '../routes';

/** QueryClient de teste: sem tentar de novo e sem cache entre testes. */
export function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
}

/** Renderiza o app (ou rotas dadas) numa URL, com todos os providers. */
export function renderApp(path = '/', routes: RouteObject[] = appRoutes) {
  const queryClient = testQueryClient();
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...result, router, queryClient };
}
