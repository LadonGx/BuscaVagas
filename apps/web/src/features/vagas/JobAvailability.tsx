import type { JobDto } from '@busca-vagas/shared';
import { RefreshCw } from 'lucide-react';
import { useCheckJob } from '../../api/jobs';
import { useToast } from '../../components/toast/toast-context';
import { Button } from '../../components/ui/Button';
import { formatAgo, formatDate, formatDay } from '../../lib/format';
import styles from './JobDrawer.module.css';

const STATE_TEXT = {
  open: 'Aberta',
  closed: 'Encerrada',
  unknown: 'Não deu para saber',
} as const;

/** "Encerrada desde 10/10" / "Aberta" / "Ainda não conferida". */
export function availabilityTitle(availability: JobDto['availability']): string {
  const { state, closedAt } = availability;
  if (!state) return 'Ainda não conferida';
  if (state === 'closed' && closedAt) return `Encerrada desde ${formatDate(closedAt)}`;
  return STATE_TEXT[state];
}

/**
 * "Ainda está aberta?" no painel da vaga: o que sabemos, quando foi conferida
 * e o botão para conferir agora (docs/features/13-availability.md).
 */
export function JobAvailability({ job, now = new Date() }: { job: JobDto; now?: Date }) {
  const check = useCheckJob();
  const toast = useToast();
  const { availability } = job;
  const { state, reason, checkedAt, deadline } = availability;

  const details = [
    reason,
    deadline && state !== 'closed' ? `Inscrições até ${formatDay(deadline)}` : null,
    checkedAt ? `Conferida ${formatAgo(checkedAt, now)}` : null,
  ].filter(Boolean);

  return (
    <section className={styles.block} aria-labelledby={`availability-${job.id}`}>
      <h3 className={styles.label} id={`availability-${job.id}`}>
        Ainda está aberta?
      </h3>
      <div className={styles.availability} data-state={state ?? 'none'}>
        <div className={styles.availabilityText}>
          <strong>{availabilityTitle(availability)}</strong>
          {details.length > 0 && <span className={styles.muted}>{details.join(' · ')}</span>}
        </div>
        <Button
          variant="ghost"
          icon={<RefreshCw size={15} aria-hidden="true" />}
          disabled={check.isPending}
          onClick={() =>
            check.mutate(job.id, {
              onSuccess: (updated) =>
                toast.show({
                  tone: updated.availability.state === 'open' ? 'success' : 'info',
                  message: `${availabilityTitle(updated.availability)}${
                    updated.availability.reason ? `: ${updated.availability.reason}` : ''
                  }`,
                }),
              onError: (error) => toast.show({ tone: 'error', message: error.message }),
            })
          }
        >
          {check.isPending ? 'Conferindo…' : 'Conferir agora'}
        </Button>
      </div>
    </section>
  );
}
