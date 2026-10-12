import type { JobDto, TriageStatus } from '@busca-vagas/shared';
import { Bookmark, PartyPopper, Undo2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useSourceName, useSources } from '../../api/discovery';
import { useJobList, useTriage, type JobFilters } from '../../api/jobs';
import { useJobCounts } from '../../api/overview';
import { usePreferencesConfigured } from '../../api/preferences';
import { nextRun } from '../../components/layout/ScanStatus';
import { useToast } from '../../components/toast/toast-context';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { formatNumber, formatUntil } from '../../lib/format';
import { useHotkeys } from '../../lib/useHotkeys';
import { JobDrawer } from '../vagas/JobDrawer';
import { SwipeCard } from './SwipeCard';
import styles from './DeslizarPage.module.css';

/** Caixa de entrada, da maior nota para a menor, sem as incompatíveis. */
export const SWIPE_FILTERS: JobFilters = { tab: 'inbox', hideIncompatible: true };
/** Quantas ações o Ctrl+Z consegue desfazer. */
export const UNDO_LIMIT = 20;
/** Busca a próxima página quando restam menos que isto carregadas. */
const PREFETCH_WHEN_LEFT = 5;

interface Action {
  /** A vaga como estava antes (para voltar exatamente a isso). */
  before: JobDto;
  status: TriageStatus;
}

export function DeslizarPage() {
  const list = useJobList(SWIPE_FILTERS);
  const triage = useTriage();
  const toast = useToast();
  const sourceName = useSourceName();
  const { data: counts } = useJobCounts();
  const { data: sources } = useSources();
  const scoreOn = usePreferencesConfigured();
  const [history, setHistory] = useState<Action[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  // Vagas já enviadas: tecla repetida rápido não manda a mesma vaga duas vezes.
  const acted = useRef(new Set<string>());

  // A triagem é otimista: a vaga sai da caixa na hora, então a atual é sempre a primeira.
  const jobs = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);
  const current = jobs[0];

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  useEffect(() => {
    if (jobs.length < PREFETCH_WHEN_LEFT && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [jobs.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const act = useCallback(
    (status: 'saved' | 'dismissed') => {
      if (!current || acted.current.has(current.id)) return;
      acted.current.add(current.id);
      const action: Action = { before: current, status };
      setHistory((previous) => [...previous, action].slice(-UNDO_LIMIT));
      triage.mutate(
        { job: current, status },
        {
          onError: (error) => {
            acted.current.delete(action.before.id);
            setHistory((previous) => previous.filter((item) => item !== action));
            toast.show({ tone: 'error', message: error.message });
          },
        },
      );
    },
    [current, triage, toast],
  );

  const undo = useCallback(() => {
    const last = history.at(-1);
    if (!last) return;
    acted.current.delete(last.before.id);
    setHistory((previous) => previous.slice(0, -1));
    triage.mutate(
      {
        job: { ...last.before, triage: last.status },
        status: last.before.triage,
        reason: last.before.dismissReason,
      },
      { onError: (error) => toast.show({ tone: 'error', message: error.message }) },
    );
  }, [history, triage, toast]);

  const openDetail = useCallback(() => {
    if (current) setDetailId(current.id);
  }, [current]);

  useHotkeys(
    {
      ArrowRight: () => act('saved'),
      ArrowLeft: () => act('dismissed'),
      ArrowUp: openDetail,
      ' ': openDetail,
      'ctrl+z': undo,
    },
    detailId === null,
  );

  const saved = history.filter((item) => item.status === 'saved').length;
  const dismissed = history.length - saved;
  const remaining = counts?.swipeable ?? jobs.length;
  const progress =
    history.length + remaining > 0 ? history.length / (history.length + remaining) : 0;
  const last = history.at(-1);
  const next = sources ? nextRun(sources.filter((source) => source.active)) : null;

  return (
    <>
      <PageHeader
        title="Deslizar"
        subtitle={`Caixa de entrada, ${scoreOn === false ? 'pela ordem de entrada' : 'da maior nota para a menor'} · ${formatNumber(remaining)} para triar`}
        actions={
          <div className={styles.tallies}>
            <p className={styles.tally} aria-live="polite">
              Nesta sessão: <strong>{saved}</strong> {saved === 1 ? 'salva' : 'salvas'} ·{' '}
              <strong>{dismissed}</strong> {dismissed === 1 ? 'descartada' : 'descartadas'}
            </p>
            {/* A contagem da sessão zera ao recarregar; o total vem do banco. */}
            {counts && (
              <p className={styles.tally}>
                No total:{' '}
                <Link to="/vagas?aba=salvas">{formatNumber(counts.triage.saved)} salvas</Link> ·{' '}
                <Link to="/vagas?aba=descartadas">
                  {formatNumber(counts.triage.dismissed)} descartadas
                </Link>
              </p>
            )}
          </div>
        }
      />

      <div className={styles.stage}>
        <div
          className={styles.progress}
          role="progressbar"
          aria-label="Progresso da triagem"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <span style={{ width: `${progress * 100}%` }} />
        </div>

        {list.isPending ? (
          <div className={styles.placeholder} aria-busy="true" aria-label="Carregando vagas" />
        ) : list.isError ? (
          <div className={styles.wide}>
            <EmptyState title="Não consegui carregar a caixa">{list.error.message}</EmptyState>
          </div>
        ) : current ? (
          <div className={styles.deck}>
            {jobs[1] && <div className={styles.behind} aria-hidden="true" />}
            <SwipeCard
              key={current.id}
              job={current}
              sourceName={sourceName(current.source)}
              onSwipe={(direction) => act(direction === 'right' ? 'saved' : 'dismissed')}
              onOpen={openDetail}
            />
          </div>
        ) : (
          <div className={styles.wide}>
            <EmptyState icon={<PartyPopper size={22} aria-hidden="true" />} title="Tudo triado">
              <p>
                {next
                  ? `A próxima busca automática roda ${formatUntil(next)}.`
                  : 'Clique em "Buscar agora" no Início para trazer vagas novas.'}
              </p>
              <p>
                <Link to="/vagas?aba=salvas">Ver as vagas salvas</Link>
              </p>
            </EmptyState>
          </div>
        )}

        <div className={styles.controls}>
          <button
            type="button"
            className={styles.round}
            data-kind="dismiss"
            disabled={!current}
            onClick={() => act('dismissed')}
            aria-label="Descartar (seta para a esquerda)"
            title="Descartar (←)"
          >
            <X size={28} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.round}
            data-kind="undo"
            disabled={history.length === 0}
            onClick={undo}
            aria-label="Desfazer (Ctrl+Z)"
            title="Desfazer (Ctrl+Z)"
          >
            <Undo2 size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.round}
            data-kind="save"
            disabled={!current}
            onClick={() => act('saved')}
            aria-label="Salvar (seta para a direita)"
            title="Salvar (→)"
          >
            <Bookmark size={26} aria-hidden="true" />
          </button>
        </div>

        <p className={styles.keys}>
          <kbd>←</kbd> descartar · <kbd>↑</kbd> detalhes · <kbd>→</kbd> salvar · <kbd>Ctrl</kbd>+
          <kbd>Z</kbd> desfazer
        </p>

        {last && (
          <p className={styles.last} role="status">
            {last.status === 'saved' ? 'Salva' : 'Descartada'}: {last.before.title}
            <button type="button" onClick={undo}>
              Desfazer
            </button>
          </p>
        )}
      </div>

      <JobDrawer jobId={detailId} onClose={() => setDetailId(null)} />
    </>
  );
}
