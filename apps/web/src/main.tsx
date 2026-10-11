import '@fontsource-variable/dm-sans';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/sora';
import './styles/tokens.css';
import './styles/base.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createQueryClient } from './api/queryClient';
import { ToastProvider } from './components/toast/ToastProvider';
import { routes } from './routes';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Elemento #root não encontrado no index.html');
}

const queryClient = createQueryClient();
const router = createBrowserRouter(routes);

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
