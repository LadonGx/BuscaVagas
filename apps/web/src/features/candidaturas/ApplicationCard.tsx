import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUSES,
  type ApplicationDto,
  type ApplicationStatus,
} from '@busca-vagas/shared';
import { CalendarClock } from 'lucide-react';
import { useId, useRef, useState, type HTMLAttributes, type Ref } from 'react';
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
  const hintId = useId();
  /** Opção escolhida pelo teclado e ainda não confirmada. */
  const [pending, setPending] = useState<ApplicationStatus | ''>('');
  /**
   * A mudança veio do teclado com a lista fechada (no Chrome/Windows as setas
   * já disparam `change`): aí só confirma com Enter ou ao sair do campo, para
   * passear pelas opções não mover o cartão a cada seta.
   */
  const fromKeyboard = useRef(false);

  function commit(status: ApplicationStatus | '') {
    setPending('');
    if (status && onMove) onMove(application.id, status);
  }

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
        <>
          {/* Fora do <label> para não entrar no nome do campo, só na descrição. */}
          <span id={hintId} className="sr-only">
            Pelo teclado, escolha com as setas e confirme com Enter.
          </span>
          <label className={styles.move}>
            <span className="sr-only">Mover {job.title} para</span>
            <select
              value={pending}
              aria-describedby={hintId}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  if (pending) {
                    event.preventDefault();
                    commit(pending);
                  }
                } else if (event.key === 'Escape') {
                  setPending('');
                } else if (event.key !== 'Tab') {
                  fromKeyboard.current = true;
                }
              }}
              onKeyUp={() => {
                fromKeyboard.current = false;
              }}
              onPointerDown={() => {
                fromKeyboard.current = false;
              }}
              onChange={(event) => {
                const status = event.target.value as ApplicationStatus | '';
                if (fromKeyboard.current) setPending(status);
                else commit(status);
              }}
              onBlur={() => {
                fromKeyboard.current = false;
                if (pending) commit(pending);
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
        </>
      )}
    </article>
  );
}
