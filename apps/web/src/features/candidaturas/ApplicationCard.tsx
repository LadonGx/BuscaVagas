import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUSES,
  type ApplicationDto,
  type ApplicationStatus,
} from '@busca-vagas/shared';
import { CalendarClock } from 'lucide-react';
import type { HTMLAttributes, Ref } from 'react';
import { ApplicationStatusChip } from '../../components/job/Chips';
import { formatAgo, formatDateTime } from '../../lib/format';
import { isOpen } from './columns';
import styles from './ApplicationCard.module.css';

interface ApplicationCardProps extends HTMLAttributes<HTMLElement> {
  application: ApplicationDto;
  now: Date;
  selected?: boolean;
  dragging?: boolean;
  onOpen?: (id: string) => void;
  onMove?: (id: string, status: ApplicationStatus) => void;
  cardRef?: Ref<HTMLElement>;
}

/** Cartão do quadro. "Mover para…" é o jeito de mudar de coluna pelo teclado. */
export function ApplicationCard({
  application,
  now,
  selected,
  dragging,
  onOpen,
  onMove,
  cardRef,
  ...rest
}: ApplicationCardProps) {
  const { job } = application;
  const hasNext = Boolean(application.nextStepAt) && isOpen(application);

  return (
    <article
      ref={cardRef}
      className={styles.card}
      data-selected={selected || undefined}
      data-dragging={dragging || undefined}
      data-closed={!isOpen(application) || undefined}
      aria-labelledby={`cand-${application.id}`}
      {...rest}
    >
      <button
        type="button"
        id={`cand-${application.id}`}
        className={styles.title}
        onClick={() => onOpen?.(application.id)}
      >
        {job.title}
      </button>
      <span className={styles.company}>{job.company}</span>

      <div className={styles.meta}>
        <ApplicationStatusChip status={application.status} />
        <span title={`Atualizada em ${new Date(application.updatedAt).toLocaleString('pt-BR')}`}>
          {formatAgo(application.updatedAt, now)}
        </span>
      </div>

      {hasNext && (
        <p className={styles.next}>
          <CalendarClock size={14} aria-hidden="true" />
          <span>
            {application.nextStepNote ? `${application.nextStepNote} · ` : 'Próxima etapa · '}
            {formatDateTime(application.nextStepAt!)}
          </span>
        </p>
      )}

      {onMove && (
        <label className={styles.move}>
          <span className="sr-only">Mover {job.title} para</span>
          <select
            value=""
            onChange={(event) => {
              const status = event.target.value as ApplicationStatus;
              if (status) onMove(application.id, status);
            }}
          >
            <option value="">Mover para…</option>
            {APPLICATION_STATUSES.filter((status) => status !== application.status).map(
              (status) => (
                <option key={status} value={status}>
                  {APPLICATION_STATUS_LABELS[status]}
                </option>
              ),
            )}
          </select>
        </label>
      )}
    </article>
  );
}
