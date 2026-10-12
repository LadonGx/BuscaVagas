import type { JobDto } from '@busca-vagas/shared';
import { useRef, useState, type PointerEvent } from 'react';
import { useSourceName } from '../../api/discovery';
import { JobChips, StackChips } from '../../components/job/Chips';
import { JobFlags } from '../../components/job/JobFlags';
import { ReasonList } from '../../components/job/ReasonList';
import { ScoreBadge } from '../../components/job/ScoreBadge';
import { formatAgo } from '../../lib/format';
import { scoreLabel } from '../../lib/score';
import { jobDate } from '../vagas/JobCard';
import styles from './SwipeCard.module.css';

/** Distância (px) que o cartão precisa andar para contar como salvar/descartar. */
export const SWIPE_THRESHOLD = 120;
const EXCERPT_LENGTH = 420;

interface SwipeCardProps {
  job: JobDto;
  sourceName: string;
  onSwipe: (direction: 'left' | 'right') => void;
  onOpen: () => void;
}

function excerpt(text: string | null): string | null {
  if (!text) return null;
  const clean = text.replace(/\s+\n/g, '\n').trim();
  return clean.length > EXCERPT_LENGTH ? `${clean.slice(0, EXCERPT_LENGTH).trimEnd()}…` : clean;
}

/**
 * O cartão do Deslizar. Arrastar com mouse ou dedo: passando do limite para a
 * direita salva, para a esquerda descarta; soltando antes, volta ao centro.
 */
export function SwipeCard({ job, sourceName, onSwipe, onOpen }: SwipeCardProps) {
  const sourceNameOf = useSourceName();
  const [dx, setDx] = useState(0);
  const start = useRef<number | null>(null);
  const text = excerpt(job.description);

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    // Botões e links dentro do cartão continuam clicáveis.
    if ((event.target as HTMLElement).closest('button, a')) return;
    start.current = event.clientX;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    if (start.current === null) return;
    setDx(event.clientX - start.current);
  }

  function onPointerUp() {
    if (start.current === null) return;
    start.current = null;
    if (dx > SWIPE_THRESHOLD) onSwipe('right');
    else if (dx < -SWIPE_THRESHOLD) onSwipe('left');
    setDx(0);
  }

  const intent =
    dx > SWIPE_THRESHOLD / 2 ? 'save' : dx < -SWIPE_THRESHOLD / 2 ? 'dismiss' : undefined;

  return (
    <article
      className={styles.card}
      aria-label={`Vaga atual: ${job.title}`}
      data-dragging={dx !== 0 || undefined}
      data-intent={intent}
      style={{ transform: `translateX(${dx}px) rotate(${dx / 30}deg)` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {intent && (
        <span className={styles.stamp} aria-hidden="true">
          {intent === 'save' ? 'Salvar' : 'Descartar'}
        </span>
      )}

      <div className={styles.top}>
        <div className={styles.heading}>
          <span className={styles.company}>
            {job.company} · via {sourceName}
          </span>
          <h2 className={styles.title}>{job.title}</h2>
        </div>
        <ScoreBadge job={job} size="lg" />
      </div>

      <p className={styles.meta}>
        {scoreLabel(job)} · {job.postedAt ? 'publicada' : 'entrou'} {formatAgo(jobDate(job))}
      </p>

      <JobChips job={job} />
      <JobFlags job={job} sourceName={sourceNameOf} />
      <ReasonList reasons={job.scoreReasons} />
      <StackChips stack={job.stack} max={8} />

      {text && <p className={styles.excerpt}>{text}</p>}

      <button type="button" className={styles.more} onClick={onOpen}>
        Ver detalhes completos (↑)
      </button>
    </article>
  );
}
