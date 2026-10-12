import type { SourceInfoDto, SourceRunDto } from '@busca-vagas/shared';
import { Building2, History } from 'lucide-react';
import { useId, useState } from 'react';
import { useSourceRuns, useSources } from '../../api/discovery';
import { Button } from '../../components/ui/Button';
import { Drawer } from '../../components/ui/Drawer';
import {
  formatAgo,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatUntil,
} from '../../lib/format';
import { useNow } from '../../lib/useNow';
import { boardNames, CompaniesDrawer } from './CompaniesDrawer';
import { ErrorText } from './ErrorText';
import styles from './Preferencias.module.css';

const KIND_LABEL: Record<SourceInfoDto['kind'], string> = {
  search: 'busca',
  'company-board': 'vagas de empresas',
};

const RUN_STATUS: Record<SourceRunDto['status'], { label: string; tone: string }> = {
  ok: { label: 'Concluída', tone: 'great' },
  failed: { label: 'Falhou', tone: 'bad' },
  running: { label: 'Rodando', tone: 'info' },
};

const plural = (count: number, one: string, many: string) =>
  `${formatNumber(count)} ${count === 1 ? one : many}`;

/** Duração de uma busca: segundos importam aqui. */
export function runDuration(ms: number | null): string | null {
  if (ms === null) return null;
  if (ms < 60_000) return `${(ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`;
  return formatDuration(ms);
}

/** Board de empresa parado só porque a lista de empresas está vazia. */
export function isIdleBoard(source: SourceInfoDto): boolean {
  return source.kind === 'company-board' && source.trackedCompanies === 0;
}

/** Linha de estado de uma fonte, para o cartão. */
export function sourceState(source: SourceInfoDto, now: Date): string {
  if (isIdleBoard(source)) return 'Parada · nenhuma empresa na lista';
  if (!source.active) return 'Desligada';
  if (source.running || source.lastRun?.status === 'running') return 'Buscando agora…';
  const run = source.lastRun;
  const parts: string[] = [];
  if (!run) parts.push('Ainda não buscou');
  else {
    const when = formatAgo(run.finishedAt ?? run.startedAt, now);
    parts.push(
      run.status === 'failed'
        ? `Falhou ${when}`
        : `${when.charAt(0).toUpperCase()}${when.slice(1)} · ${plural(run.jobsFound, 'vaga', 'vagas')} (${plural(run.jobsNew, 'nova', 'novas')})`,
    );
  }
  if (source.nextRunAt) parts.push(`próxima ${formatUntil(source.nextRunAt, now)}`);
  return parts.join(' · ');
}

/** Estado de cada fonte e o histórico de buscas. */
export function SourcesCard() {
  const { data: sources, isError, error } = useSources();
  const now = useNow();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [companiesOpen, setCompaniesOpen] = useState(false);
  // Só os boards que a API consegue usar (os com configuração inválida ficam de fora).
  const boards = (sources ?? []).filter(
    (source) => source.kind === 'company-board' && source.trackedCompanies !== null,
  );

  return (
    <section className={styles.card} aria-labelledby="fontes-titulo">
      <h2 id="fontes-titulo" className={styles.cardTitle}>
        Fontes
      </h2>
      {isError && <p className={styles.error}>{error.message}</p>}
      <ul className={styles.sources}>
        {sources?.map((source) => {
          const failed = source.active && source.lastRun?.status === 'failed';
          return (
            <li key={source.id} className={styles.source}>
              <span
                className={styles.dot}
                data-state={!source.active ? 'off' : failed ? 'failed' : 'on'}
                aria-hidden="true"
              />
              <div className={styles.sourceText}>
                <span>
                  <strong>{source.displayName}</strong>{' '}
                  <span className={styles.hint}>
                    {KIND_LABEL[source.kind]}
                    {!!source.trackedCompanies &&
                      ` · ${plural(source.trackedCompanies, 'empresa', 'empresas')}`}
                  </span>
                </span>
                <span className={styles.hint}>{sourceState(source, now)}</span>
                {!source.active && source.reason && !isIdleBoard(source) && (
                  <span className={styles.reason}>{source.reason}</span>
                )}
                {failed && source.lastRun?.error && <ErrorText error={source.lastRun.error} />}
              </div>
            </li>
          );
        })}
      </ul>
      {boards.length > 0 && (
        <>
          <p className={styles.hint}>{boardNames(boards)} buscam nas empresas da sua lista.</p>
          <Button
            icon={<Building2 size={16} aria-hidden="true" />}
            onClick={() => setCompaniesOpen(true)}
          >
            Empresas acompanhadas
          </Button>
        </>
      )}
      <Button icon={<History size={16} aria-hidden="true" />} onClick={() => setHistoryOpen(true)}>
        Ver histórico de buscas
      </Button>
      <CompaniesDrawer
        open={companiesOpen}
        onClose={() => setCompaniesOpen(false)}
        boards={boards}
      />
      <RunsDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        sources={sources ?? []}
      />
    </section>
  );
}

interface RunsDrawerProps {
  open: boolean;
  onClose: () => void;
  sources: SourceInfoDto[];
}

function RunsDrawer({ open, onClose, sources }: RunsDrawerProps) {
  const [sourceId, setSourceId] = useState<string | null>(null);
  const runs = useSourceRuns(sourceId, open);
  const selectId = useId();
  const items = runs.data?.pages.flatMap((page) => page.items) ?? [];
  const name = (id: string) => sources.find((source) => source.id === id)?.displayName ?? id;

  return (
    <Drawer open={open} onClose={onClose} title="Histórico de buscas">
      <div className={styles.filterRow}>
        <label htmlFor={selectId} className={styles.legend}>
          Fonte
        </label>
        <select
          id={selectId}
          className={styles.select}
          value={sourceId ?? ''}
          onChange={(event) => setSourceId(event.target.value || null)}
        >
          <option value="">Todas</option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.displayName}
            </option>
          ))}
        </select>
      </div>

      {runs.isPending && <p className={styles.hint}>Carregando…</p>}
      {runs.isError && <p className={styles.error}>{runs.error.message}</p>}
      {runs.isSuccess && items.length === 0 && (
        <p className={styles.hint}>Nenhuma busca registrada ainda.</p>
      )}

      <ol className={styles.runs}>
        {items.map((run) => (
          <li key={run.id} className={styles.run}>
            <div className={styles.runHead}>
              <strong>{name(run.sourceId)}</strong>
              <span className={styles.runStatus} data-tone={RUN_STATUS[run.status].tone}>
                {RUN_STATUS[run.status].label}
              </span>
              <span className={styles.hint}>
                {run.trigger === 'manual' ? 'Buscar agora' : 'Agendada'}
              </span>
            </div>
            <p className={styles.hint}>
              {formatDateTime(run.startedAt)}
              {runDuration(run.durationMs) && ` · levou ${runDuration(run.durationMs)}`}
            </p>
            {run.status !== 'running' && (
              <p className={styles.runStats}>
                {plural(run.jobsFound, 'encontrada', 'encontradas')} ·{' '}
                {plural(run.jobsNew, 'nova', 'novas')}
                {run.filtered > 0 && ` · ${plural(run.filtered, 'filtrada', 'filtradas')}`}
                {run.dropped > 0 &&
                  ` · ${plural(run.dropped, 'fora do formato', 'fora do formato')}`}
              </p>
            )}
            {run.terms.length > 0 && <p className={styles.hint}>Termos: {run.terms.join(', ')}</p>}
            {run.error && <ErrorText error={run.error} />}
          </li>
        ))}
      </ol>

      {runs.hasNextPage && (
        <Button disabled={runs.isFetchingNextPage} onClick={() => void runs.fetchNextPage()}>
          {runs.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
        </Button>
      )}
    </Drawer>
  );
}
