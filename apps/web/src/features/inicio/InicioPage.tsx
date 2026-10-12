import { UPCOMING_DAYS, type ResumeDto } from '@busca-vagas/shared';
import { FileText, LayoutGrid, PlusCircle, TabletSmartphone } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useDashboard } from '../../api/dashboard';
import { useSources } from '../../api/discovery';
import { useApplicationSummary, useJobCounts } from '../../api/overview';
import { usePreferences } from '../../api/preferences';
import { useResume } from '../../api/resume';
import { ScanButton } from '../../components/ScanButton';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { formatNumber } from '../../lib/format';
import { useNow } from '../../lib/useNow';
import { JobDrawer } from '../vagas/JobDrawer';
import { ManualJobDialog } from '../vagas/ManualJobDialog';
import { Funnel, NewJobsChart } from './Charts';
import { FirstSteps, TopNew, UpcomingSteps } from './Lists';
import styles from './Inicio.module.css';

const today = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** Algum campo, texto ou entrada com conteúdo. */
export function resumeStarted(resume: ResumeDto): boolean {
  return resume.sections.some((section) =>
    section.items.some((item) => {
      const data = item.data as { value?: string; text?: string; title?: string };
      return Boolean((data.value ?? data.text ?? data.title ?? '').trim());
    }),
  );
}

const plural = (count: number, one: string, many: string) =>
  `${formatNumber(count)} ${count === 1 ? one : many}`;

export function InicioPage() {
  const now = useNow();
  const dashboard = useDashboard();
  const { data: counts } = useJobCounts();
  const { data: summary } = useApplicationSummary();
  const { data: preferences } = usePreferences();
  const { data: resume } = useResume();
  const { data: sources } = useSources();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const data = dashboard.data;

  const openJob = (id: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set('vaga', id);
      return next;
    });
  const closeJob = () =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('vaga');
      return next;
    });

  const subtitle = data
    ? `${today.format(now)} · ${plural(data.newLast24h, 'vaga nova', 'vagas novas')} desde ontem`
    : today.format(now);

  const stats = data
    ? [
        {
          key: 'novas',
          value: formatNumber(data.newLast24h),
          label: 'Vagas novas',
          hint: 'nas últimas 24 h',
        },
        {
          key: 'nota',
          value: preferences?.configured === false ? '—' : formatNumber(data.highScoreInbox),
          label: 'Nota ≥ 800',
          hint:
            preferences?.configured === false ? (
              <Link to="/preferencias">configure as preferências</Link>
            ) : (
              'na caixa de entrada'
            ),
        },
        {
          key: 'etapas',
          value: formatNumber(data.stepsNextDays),
          label: data.stepsNextDays === 1 ? 'Etapa marcada' : 'Etapas marcadas',
          hint: `nos próximos ${UPCOMING_DAYS} dias`,
        },
        {
          key: 'propostas',
          value: summary ? formatNumber(summary.offer) : '…',
          label: summary?.offer === 1 ? 'Proposta' : 'Propostas',
          hint: 'em aberto',
        },
      ]
    : [];

  return (
    <>
      <PageHeader title="Início" subtitle={subtitle} actions={<ScanButton />} />

      <FirstSteps
        preferences={preferences}
        resumeStarted={resume ? resumeStarted(resume) : undefined}
        searched={sources ? sources.some((source) => source.lastRun?.status === 'ok') : undefined}
      />

      <section aria-labelledby="atalhos" className={styles.block}>
        <h2 id="atalhos" className="sr-only">
          Atalhos
        </h2>
        <div className={styles.shortcuts}>
          <Link to="/deslizar" className={styles.shortcut}>
            <TabletSmartphone size={18} aria-hidden="true" />
            <span>
              <strong>Triar no deslizar</strong>
              <span>{counts ? `${formatNumber(counts.swipeable)} na caixa` : '…'}</span>
            </span>
          </Link>
          <Link to="/vagas?aba=salvas" className={styles.shortcut}>
            <LayoutGrid size={18} aria-hidden="true" />
            <span>
              <strong>Ver vagas</strong>
              <span>{counts ? plural(counts.triage.saved, 'salva', 'salvas') : '…'}</span>
            </span>
          </Link>
          <button type="button" className={styles.shortcut} onClick={() => setCreating(true)}>
            <PlusCircle size={18} aria-hidden="true" />
            <span>
              <strong>Vaga manual</strong>
              <span>indicação, LinkedIn…</span>
            </span>
          </button>
          <Link to="/curriculo" className={styles.shortcut}>
            <FileText size={18} aria-hidden="true" />
            <span>
              <strong>Currículo</strong>
              <span>copiar campos</span>
            </span>
          </Link>
        </div>
      </section>

      {dashboard.isError && (
        <EmptyState title="Não consegui carregar o painel">{dashboard.error.message}</EmptyState>
      )}
      {dashboard.isPending && <p className={styles.muted}>Carregando o painel…</p>}

      {data && (
        <>
          <section aria-labelledby="semana" className={styles.block}>
            <h2 id="semana" className={styles.blockTitle}>
              Esta semana
            </h2>
            <div className={styles.stats}>
              {stats.map((stat) => (
                <div key={stat.key} className={styles.stat}>
                  <span className={styles.statValue}>{stat.value}</span>
                  <span className={styles.statLabel}>{stat.label}</span>
                  <span className={styles.muted}>{stat.hint}</span>
                </div>
              ))}
            </div>
          </section>

          <div className={styles.columnsGrid}>
            <section className={styles.card} aria-labelledby="melhores">
              <div className={styles.cardHead}>
                <h2 id="melhores" className={styles.cardTitle}>
                  Melhores vagas novas
                </h2>
                <Link to="/vagas" className={styles.more}>
                  Ver todas
                </Link>
              </div>
              <TopNew jobs={data.topNew} now={now} onOpen={openJob} />
            </section>

            <section className={styles.card} aria-labelledby="etapas">
              <div className={styles.cardHead}>
                <h2 id="etapas" className={styles.cardTitle}>
                  Próximas etapas
                </h2>
                <Link to="/candidaturas" className={styles.more}>
                  Candidaturas
                </Link>
              </div>
              <UpcomingSteps steps={data.upcomingSteps} now={now} />
            </section>

            <section className={styles.card} aria-labelledby="por-dia">
              <div className={styles.cardHead}>
                <h2 id="por-dia" className={styles.cardTitle}>
                  Vagas novas por dia
                </h2>
                <span className={styles.muted}>
                  últimos {data.newJobsPerDay.length} dias · passe o mouse para ver o número
                </span>
              </div>
              <NewJobsChart days={data.newJobsPerDay} />
            </section>

            <section className={styles.card} aria-labelledby="funil">
              <h2 id="funil" className={styles.cardTitle}>
                Funil das candidaturas
              </h2>
              <Funnel funnel={data.funnel} medianDays={data.medianDaysToFirstResponse} />
            </section>
          </div>
        </>
      )}

      <JobDrawer jobId={params.get('vaga')} onClose={closeJob} />
      <ManualJobDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => openJob(id)}
      />
    </>
  );
}
