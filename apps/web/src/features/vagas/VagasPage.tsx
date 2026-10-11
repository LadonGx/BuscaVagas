import type { JobDto } from '@busca-vagas/shared';
import { Plus, SearchX } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useJobList, type JobFilters } from '../../api/jobs';
import { useJobCounts } from '../../api/overview';
import { usePreferencesConfigured } from '../../api/preferences';
import { useTriageAction } from '../../components/job/useTriageAction';
import { ScanButton } from '../../components/ScanButton';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { formatNumber } from '../../lib/format';
import { useInfiniteScroll } from '../../lib/useInfiniteScroll';
import { useNow } from '../../lib/useNow';
import { JobCard } from './JobCard';
import { JobDrawer } from './JobDrawer';
import { ManualJobDialog } from './ManualJobDialog';
import { useJobFilters } from './useJobFilters';
import { VagasToolbar } from './VagasToolbar';
import styles from './VagasPage.module.css';

const EMPTY_TEXT: Record<JobFilters['tab'], { title: string; body: string }> = {
  inbox: {
    title: 'Caixa vazia',
    body: 'Tudo triado. Clique em "Buscar agora" ou espere a próxima busca automática.',
  },
  saved: { title: 'Nenhuma vaga salva', body: 'Salve vagas na caixa para vê-las aqui.' },
  applied: {
    title: 'Nenhuma candidatura ainda',
    body: 'Abra uma vaga e clique em "Me candidatei" para acompanhar o processo.',
  },
  dismissed: {
    title: 'Nenhuma vaga descartada',
    body: 'Descartadas ficam aqui por 30 dias e depois saem sozinhas.',
  },
};

function hasFilters(filters: JobFilters): boolean {
  return Boolean(filters.q || filters.workModel || filters.minScore || filters.hideIncompatible);
}

export function VagasPage() {
  const controls = useJobFilters();
  const { filters } = controls;
  const list = useJobList(filters);
  const { data: counts } = useJobCounts();
  const scoreOn = usePreferencesConfigured();
  const triage = useTriageAction();
  const now = useNow(60_000);
  const [creating, setCreating] = useState(false);

  const jobs = list.data?.pages.flatMap((page) => page.items) ?? [];
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = list;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const sentinel = useInfiniteScroll<HTMLDivElement>(loadMore, Boolean(hasNextPage));

  const effectiveSort = filters.sort ?? (scoreOn ? 'score' : 'recent');
  const subtitle = [
    counts && `${formatNumber(counts.triage.inbox)} na caixa`,
    effectiveSort === 'score' ? 'ordenadas pela sua nota' : 'ordenadas pelas mais recentes',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <PageHeader
        title="Vagas"
        subtitle={subtitle}
        actions={
          <>
            <Button icon={<Plus size={16} aria-hidden="true" />} onClick={() => setCreating(true)}>
              Vaga manual
            </Button>
            <ScanButton />
          </>
        }
      />

      {scoreOn === false && (
        <p className={styles.notice}>
          Sem preferências, as vagas não têm nota. Configure em Preferências para ordenar pelo que
          combina com você.
        </p>
      )}

      <VagasToolbar
        filters={filters}
        counts={counts}
        onTab={controls.setTab}
        onQuery={controls.setQuery}
        onWorkModels={controls.setWorkModels}
        onMinScore={controls.setMinScore}
        onSort={controls.setSort}
        onHideIncompatible={controls.setHideIncompatible}
      />

      {list.isPending ? (
        <div className={styles.grid} aria-busy="true" aria-label="Carregando vagas">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className={styles.skeleton} />
          ))}
        </div>
      ) : list.isError ? (
        <EmptyState title="Não consegui carregar as vagas">
          <p>{list.error.message}</p>
          <Button onClick={() => void list.refetch()}>Tentar de novo</Button>
        </EmptyState>
      ) : jobs.length === 0 ? (
        hasFilters(filters) ? (
          <EmptyState
            icon={<SearchX size={22} aria-hidden="true" />}
            title="Nada com esses filtros"
          >
            Tente tirar algum filtro ou mudar a busca.
          </EmptyState>
        ) : (
          <EmptyState title={EMPTY_TEXT[filters.tab].title}>
            {EMPTY_TEXT[filters.tab].body}
          </EmptyState>
        )
      ) : (
        <>
          <div className={styles.grid}>
            {jobs.map((job: JobDto) => (
              <JobCard
                key={job.id}
                job={job}
                now={now}
                onOpen={(opened) => controls.openJob(opened.id)}
                onTriage={(target, status) => triage(target, status)}
              />
            ))}
          </div>

          <div ref={sentinel} className={styles.more}>
            {hasNextPage ? (
              <Button onClick={loadMore} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
              </Button>
            ) : (
              <span className={styles.end}>
                {formatNumber(jobs.length)} {jobs.length === 1 ? 'vaga' : 'vagas'} · fim da lista
              </span>
            )}
          </div>
        </>
      )}

      <JobDrawer jobId={controls.openJobId} onClose={controls.closeJob} />
      <ManualJobDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => controls.openJob(id)}
      />
    </>
  );
}
