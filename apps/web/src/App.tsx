import { useEffect, useState } from 'react';
import { fetchHealth, type HealthReport } from './api';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; report: HealthReport }
  | { kind: 'offline'; message: string };

const LABELS: Record<keyof HealthReport['checks'], string> = {
  database: 'Banco (Postgres)',
  redis: 'Fila (Redis)',
};

export function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    fetchHealth(controller.signal)
      .then((report) => setState({ kind: 'ready', report }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ kind: 'offline', message: error instanceof Error ? error.message : 'erro' });
        }
      });

    return () => controller.abort();
  }, []);

  return (
    <main className="page">
      <h1>busca-vagas</h1>
      <p className="muted">Estrutura do projeto no ar. As telas chegam na Fase 2.</p>

      <section className="card">
        <h2>Status</h2>
        {state.kind === 'loading' && <p>Verificando a API…</p>}

        {state.kind === 'offline' && (
          <p className="down">
            API fora do ar ({state.message}). Rode <code>pnpm dev:api</code>.
          </p>
        )}

        {state.kind === 'ready' && (
          <ul className="checks">
            <li className="up">API</li>
            {Object.entries(state.report.checks).map(([name, status]) => (
              <li key={name} className={status}>
                {LABELS[name as keyof HealthReport['checks']]}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
