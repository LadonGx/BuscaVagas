import type { RouteObject } from 'react-router';
import { AppLayout } from './components/layout/AppLayout';
import { CandidaturasPage } from './features/candidaturas/CandidaturasPage';
import { CurriculoPage } from './features/curriculo/CurriculoPage';
import { DeslizarPage } from './features/deslizar/DeslizarPage';
import { NotFoundPage } from './features/erros/NotFoundPage';
import { RouteError } from './features/erros/RouteError';
import { InicioPage } from './features/inicio/InicioPage';
import { PreferenciasPage } from './features/preferencias/PreferenciasPage';
import { VagasPage } from './features/vagas/VagasPage';

/** Rotas do app. O menu (`components/layout/nav.ts`) segue a mesma ordem. */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <InicioPage /> },
      { path: 'vagas', element: <VagasPage /> },
      { path: 'deslizar', element: <DeslizarPage /> },
      { path: 'candidaturas', element: <CandidaturasPage /> },
      { path: 'candidaturas/:id', element: <CandidaturasPage /> },
      { path: 'curriculo', element: <CurriculoPage /> },
      { path: 'preferencias', element: <PreferenciasPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
