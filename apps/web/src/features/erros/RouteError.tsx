import { Bug } from 'lucide-react';
import { useRouteError } from 'react-router';
import { EmptyState } from '../../components/ui/EmptyState';

/** Erro inesperado ao montar uma tela: mostra a mensagem em vez da tela em branco. */
export function RouteError() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : String(error);

  return (
    <main style={{ padding: 32 }}>
      <EmptyState icon={<Bug size={22} aria-hidden="true" />} title="Algo quebrou nesta tela">
        <p>{message}</p>
        <p>
          Recarregue a página. Se continuar, o erro completo está no console do navegador (F12).
        </p>
      </EmptyState>
    </main>
  );
}
