import type { JobDto } from '@busca-vagas/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useSourceName } from '../../api/discovery';
import { findLoadedJob, useApply, useJob } from '../../api/jobs';
import { JobChips, StackChips, StatusChip } from '../../components/job/Chips';
import { ReasonList } from '../../components/job/ReasonList';
import { ScoreBadge } from '../../components/job/ScoreBadge';
import { useTriageAction } from '../../components/job/useTriageAction';
import { useToast } from '../../components/toast/toast-context';
import { Button } from '../../components/ui/Button';
import { Drawer } from '../../components/ui/Drawer';
import { formatAgo } from '../../lib/format';
import { scoreLabel } from '../../lib/score';
import { JobAvailability } from './JobAvailability';
import { jobDate } from './JobCard';
import { JobHistory } from './JobHistory';
import styles from './JobDrawer.module.css';

/** Motivos comuns para descartar — um clique em vez de digitar. */
export const DISMISS_SUGGESTIONS = [
  'Presencial',
  'Sênior demais',
  'Stack diferente',
  'Salário baixo',
];

interface JobDrawerProps {
  jobId: string | null;
  onClose: () => void;
}

/** Detalhe da vaga no painel lateral: nota e motivos, descrição e ações. */
export function JobDrawer({ jobId, onClose }: JobDrawerProps) {
  const queryClient = useQueryClient();
  const placeholder = jobId ? findLoadedJob(queryClient, jobId) : undefined;
  const { data: job, isError, error } = useJob(jobId, placeholder);
  const sourceName = useSourceName();

  return (
    <Drawer
      open={Boolean(jobId)}
      onClose={onClose}
      eyebrow={job ? `${job.company} · via ${sourceName(job.source)}` : undefined}
      title={job?.title ?? (isError ? 'Vaga não encontrada' : 'Carregando…')}
      footer={job && <JobDrawerActions key={job.id} job={job} onClose={onClose} />}
    >
      {isError && <p className={styles.muted}>{error.message}</p>}
      {job && <JobDetails job={job} />}
    </Drawer>
  );
}

function JobDetails({ job }: { job: JobDto }) {
  const date = jobDate(job);
  return (
    <>
      <div className={styles.scoreRow}>
        <ScoreBadge job={job} size="lg" />
        <div className={styles.scoreText}>
          <span>{scoreLabel(job)}</span>
          <span className={styles.muted}>
            <StatusChip job={job} /> · {job.postedAt ? 'publicada' : 'entrou'}{' '}
            {formatAgo(date, new Date())}
          </span>
        </div>
      </div>

      <JobChips job={job} />

      <JobAvailability job={job} />

      {job.scoreReasons.length > 0 && (
        <section className={styles.block}>
          <h3 className={styles.label}>Por que essa nota</h3>
          <ReasonList reasons={job.scoreReasons} />
        </section>
      )}

      {job.stack.length > 0 && (
        <section className={styles.block}>
          <h3 className={styles.label}>Stack detectada</h3>
          <StackChips stack={job.stack} max={50} />
        </section>
      )}

      {job.dismissReason && <p className={styles.muted}>Descartada: {job.dismissReason}</p>}

      <JobHistory job={job} />

      <section className={styles.block}>
        <h3 className={styles.label}>Descrição</h3>
        {/* Texto da fonte, sem HTML: vai como texto puro, nunca como marcação. */}
        {job.description ? (
          <p className={styles.description}>{job.description}</p>
        ) : (
          <p className={styles.muted}>A fonte não trouxe descrição.</p>
        )}
      </section>

      {job.url && (
        <a className={styles.external} href={job.url} target="_blank" rel="noreferrer noopener">
          <ExternalLink size={16} aria-hidden="true" />
          Abrir a vaga no site (nova aba)
        </a>
      )}
    </>
  );
}

function JobDrawerActions({ job, onClose }: { job: JobDto; onClose: () => void }) {
  const triage = useTriageAction();
  const apply = useApply();
  const toast = useToast();
  const navigate = useNavigate();
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState('');

  if (dismissing) {
    return (
      <form
        className={styles.dismiss}
        onSubmit={(event) => {
          event.preventDefault();
          triage(job, 'dismissed', reason.trim() || null);
          onClose();
        }}
      >
        <label className={styles.reasonLabel}>
          Motivo (opcional)
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={200}
            placeholder="Ex.: presencial, sênior demais…"
            autoFocus
          />
        </label>
        <div className={styles.suggestions}>
          {DISMISS_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className={styles.suggestion}
              aria-pressed={reason === suggestion}
              onClick={() => setReason(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
        <div className={styles.buttons}>
          <Button type="submit" variant="primary">
            Descartar
          </Button>
          <Button variant="ghost" onClick={() => setDismissing(false)}>
            Cancelar
          </Button>
        </div>
      </form>
    );
  }

  return (
    <>
      {job.triage === 'saved' ? (
        <Button onClick={() => triage(job, 'inbox')}>Tirar dos salvos</Button>
      ) : (
        <Button variant="primary" onClick={() => triage(job, 'saved')}>
          Salvar
        </Button>
      )}

      {job.application ? (
        <Link className={styles.linkButton} to={`/candidaturas/${job.application.id}`}>
          Ver candidatura
        </Link>
      ) : (
        <Button
          disabled={apply.isPending}
          onClick={() =>
            apply.mutate(job.id, {
              onSuccess: (application) =>
                toast.show({
                  tone: 'success',
                  message: 'Candidatura registrada. A vaga foi para Candidaturas.',
                  action: {
                    label: 'Abrir',
                    onClick: () => navigate(`/candidaturas/${application.id}`),
                  },
                }),
              onError: (error) => toast.show({ tone: 'error', message: error.message }),
            })
          }
        >
          Me candidatei
        </Button>
      )}

      {job.triage === 'dismissed' ? (
        <Button variant="ghost" onClick={() => triage(job, 'inbox')}>
          Voltar para a caixa
        </Button>
      ) : (
        !job.application && (
          <Button variant="ghost" onClick={() => setDismissing(true)}>
            Descartar…
          </Button>
        )
      )}
    </>
  );
}
