import styles from './Preferencias.module.css';

/** Até onde o erro aparece direto; o resto fica em "ver detalhes". */
const SHORT = 140;

/** Primeira linha do erro, cortada; o texto todo fica atrás de "ver detalhes". */
export function shortError(error: string): string {
  const first = error.split('\n')[0]!.trim();
  return first.length > SHORT ? `${first.slice(0, SHORT - 1).trimEnd()}…` : first;
}

/**
 * Erro de busca (às vezes uma pilha inteira do Prisma): mostra o começo e
 * guarda o texto completo num "ver detalhes".
 */
export function ErrorText({ error }: { error: string }) {
  const short = shortError(error);
  if (short === error.trim()) return <div className={styles.reason}>{error}</div>;
  return (
    <div className={styles.reason}>
      {short}
      <details className={styles.details}>
        <summary>ver detalhes</summary>
        <pre>{error}</pre>
      </details>
    </div>
  );
}
