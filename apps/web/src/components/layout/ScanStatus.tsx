import type { SourceInfoDto } from '@busca-vagas/shared';
import { isScanning, useRefreshWhenScanEnds, useSources } from '../../api/discovery';
import { formatAgo, formatNumber, formatUntil } from '../../lib/format';
import { useNow } from '../../lib/useNow';
import styles from './ScanStatus.module.css';

function lastRunLine(source: SourceInfoDto, now: Date): string {
  const run = source.lastRun;
  // A execução em andamento já é a "última" no banco, com 0 vagas: não mostrar isso.
  if (source.running || run?.status === 'running') return `${source.displayName}: buscando agora…`;
  if (!run) return `${source.displayName}: ainda não buscou`;
  const when = formatAgo(run.finishedAt ?? run.startedAt, now);
  if (run.status === 'failed') return `${source.displayName}: falhou ${when}`;
  return `${source.displayName}: ${when} · ${formatNumber(run.jobsFound)} vagas`;
}

/** A próxima busca agendada entre as fontes ativas. */
export function nextRun(sources: readonly SourceInfoDto[]): string | null {
  const times = sources
    .map((source) => source.nextRunAt)
    .filter((value): value is string => Boolean(value))
    .sort();
  return times[0] ?? null;
}

/**
 * Rodapé do menu: última busca de cada fonte ativa e quando vem a próxima.
 * Também é quem percebe o fim de uma busca e recarrega as vagas.
 */
export function ScanStatus() {
  const { data: sources, isError } = useSources();
  const now = useNow();
  useRefreshWhenScanEnds(sources);

  if (isError || !sources) return null;

  const active = sources.filter((source) => source.active);
  if (active.length === 0) {
    return <p className={styles.status}>Nenhuma fonte ativa. Veja Preferências → Fontes.</p>;
  }

  const next = nextRun(active);

  return (
    <p className={styles.status} aria-live="polite">
      {active.map((source) => (
        <span key={source.id} className={styles.line}>
          {lastRunLine(source, now)}
        </span>
      ))}
      {!isScanning(sources) && (
        <span className={styles.line}>
          {next ? `Próxima busca ${formatUntil(next, now)}` : 'Busca automática desligada'}
        </span>
      )}
    </p>
  );
}
