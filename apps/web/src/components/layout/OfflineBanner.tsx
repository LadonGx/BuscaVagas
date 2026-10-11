import { TriangleAlert } from 'lucide-react';
import { useHealth, useRefetchWhenBackOnline } from '../../api/health';
import styles from './OfflineBanner.module.css';

/**
 * Faixa no topo quando a API (ou o banco/fila por trás dela) está fora. As
 * telas continuam mostrando o que já estava carregado.
 */
export function OfflineBanner() {
  const { data, isError } = useHealth();
  useRefetchWhenBackOnline();

  if (isError) {
    return (
      <div className={styles.banner} role="alert">
        <TriangleAlert size={18} aria-hidden="true" />
        <span>
          A API não respondeu. Rode <code>pnpm dev:api</code> na pasta do projeto — esta tela volta
          sozinha quando ela subir.
        </span>
      </div>
    );
  }

  if (data?.status === 'degraded') {
    const down = [
      data.checks.database === 'down' && 'o banco (Postgres)',
      data.checks.redis === 'down' && 'a fila (Redis)',
    ].filter(Boolean);
    return (
      <div className={styles.banner} role="alert">
        <TriangleAlert size={18} aria-hidden="true" />
        <span>
          A API está no ar, mas {down.join(' e ')} não. Rode <code>pnpm infra:up</code>.
        </span>
      </div>
    );
  }

  return null;
}
