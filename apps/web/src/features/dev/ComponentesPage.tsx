import { useState } from 'react';
import { JobChips, StackChips, StatusChip } from '../../components/job/Chips';
import { ReasonLine, ReasonList } from '../../components/job/ReasonList';
import { ScoreBadge } from '../../components/job/ScoreBadge';
import { Button } from '../../components/ui/Button';
import { Drawer } from '../../components/ui/Drawer';
import { PageHeader } from '../../components/ui/PageHeader';
import { cardReasons } from '../../lib/score';
import { SAMPLE_JOBS } from './samples';
import styles from './ComponentesPage.module.css';

/**
 * Vitrine dos componentes de vaga com dados de exemplo — para revisar o
 * visual nos dois temas sem depender da API. Só existe no `pnpm dev:web`.
 */
export function ComponentesPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = SAMPLE_JOBS.find(({ job }) => job.id === openId)?.job;

  return (
    <>
      <PageHeader
        title="Componentes"
        subtitle="Vitrine do modo dev: selo da nota, motivos, chips e painel lateral."
      />

      <section className={styles.section}>
        <h2 className={styles.heading}>Selo da nota, por faixa</h2>
        <div className={styles.badges}>
          {SAMPLE_JOBS.map(({ label, job }) => (
            <figure key={job.id} className={styles.badgeItem}>
              <ScoreBadge job={job} />
              <ScoreBadge job={job} size="lg" />
              <figcaption>{label}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Prévia dos cartões (o cartão de verdade vem no passo 3)</h2>
        <div className={styles.grid}>
          {SAMPLE_JOBS.map(({ job }) => (
            <article key={job.id} className={styles.card}>
              <div className={styles.cardTop}>
                <div className={styles.cardTitle}>
                  <span className={styles.company}>{job.company}</span>
                  <button
                    type="button"
                    className={styles.titleButton}
                    onClick={() => setOpenId(job.id)}
                  >
                    {job.title}
                  </button>
                </div>
                <ScoreBadge job={job} />
              </div>
              <JobChips job={job} />
              <StackChips stack={job.stack} />
              <ReasonLine reasons={cardReasons(job)} />
              <div className={styles.cardFoot}>
                <StatusChip job={job} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <Drawer
        open={Boolean(open)}
        onClose={() => setOpenId(null)}
        eyebrow={open ? `${open.company} · via ${open.source}` : undefined}
        title={open?.title}
        footer={
          <>
            <Button variant="primary">Salvar</Button>
            <Button>Me candidatei</Button>
            <Button variant="ghost">Descartar…</Button>
          </>
        }
      >
        {open && (
          <>
            <div className={styles.drawerScore}>
              <ScoreBadge job={open} size="lg" />
              <span className={styles.muted}>
                {open.scoreCoverage === null
                  ? 'Sem nota'
                  : `Cobertura ${open.scoreCoverage}% dos critérios`}
              </span>
            </div>
            <JobChips job={open} />
            <div className={styles.block}>
              <h3 className={styles.label}>Por que essa nota</h3>
              <ReasonList reasons={open.scoreReasons} />
            </div>
            <StackChips stack={open.stack} max={20} />
            <div className={styles.block}>
              <h3 className={styles.label}>Descrição</h3>
              <p className={styles.description}>{open.description}</p>
            </div>
          </>
        )}
      </Drawer>
    </>
  );
}
