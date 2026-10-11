import { scoreTier, type JobDto } from '@busca-vagas/shared';
import { Bookmark, BookmarkCheck, ExternalLink, Eye, Inbox, X } from 'lucide-react';
import { JobChips, StackChips, StatusChip } from '../../components/job/Chips';
import { ReasonLine } from '../../components/job/ReasonList';
import { ScoreBadge } from '../../components/job/ScoreBadge';
import { formatAgo } from '../../lib/format';
import { cardReasons, TIER_TONE } from '../../lib/score';
import styles from './JobCard.module.css';

interface JobCardProps {
  job: JobDto;
  now: Date;
  onOpen: (job: JobDto) => void;
  onTriage: (job: JobDto, status: JobDto['triage']) => void;
}

/** Quando a vaga foi publicada (ou, sem essa data, quando entrou no app). */
export function jobDate(job: Pick<JobDto, 'postedAt' | 'firstSeenAt'>): string {
  return job.postedAt ?? job.firstSeenAt;
}

export function JobCard({ job, now, onOpen, onTriage }: JobCardProps) {
  const tier = scoreTier(job);
  const dim = tier === 'incompatible' || job.triage === 'dismissed';
  const date = jobDate(job);

  return (
    <article
      className={styles.card}
      data-tone={TIER_TONE[tier]}
      data-dim={dim || undefined}
      aria-labelledby={`vaga-${job.id}`}
    >
      <div className={styles.top}>
        <div className={styles.heading}>
          <span className={styles.company}>{job.company}</span>
          <h2 className={styles.titleWrap}>
            <button
              type="button"
              id={`vaga-${job.id}`}
              className={styles.title}
              onClick={() => onOpen(job)}
            >
              {job.title}
            </button>
          </h2>
        </div>
        <ScoreBadge job={job} />
      </div>

      <JobChips job={job} />
      <StackChips stack={job.stack} />

      {tier === 'pending' ? (
        <p className={styles.note}>Nota sendo calculada…</p>
      ) : (
        <ReasonLine reasons={cardReasons(job)} />
      )}

      <div className={styles.footer}>
        <StatusChip job={job} />
        <time
          className={styles.date}
          dateTime={date}
          title={`${job.postedAt ? 'Publicada' : 'Entrou no app'} em ${new Date(date).toLocaleString('pt-BR')}`}
        >
          {formatAgo(date, now)}
        </time>

        <div className={styles.actions}>
          {job.triage === 'saved' ? (
            <button
              type="button"
              className={styles.iconButton}
              data-active
              aria-label={`Tirar dos salvos: ${job.title}`}
              title="Tirar dos salvos"
              onClick={() => onTriage(job, 'inbox')}
            >
              <BookmarkCheck size={16} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              className={styles.iconButton}
              aria-label={`Salvar: ${job.title}`}
              title="Salvar"
              onClick={() => onTriage(job, 'saved')}
            >
              <Bookmark size={16} aria-hidden="true" />
            </button>
          )}

          {job.triage === 'dismissed' ? (
            <button
              type="button"
              className={styles.iconButton}
              aria-label={`Voltar para a caixa: ${job.title}`}
              title="Voltar para a caixa"
              onClick={() => onTriage(job, 'inbox')}
            >
              <Inbox size={16} aria-hidden="true" />
            </button>
          ) : (
            // Vaga com candidatura não pode ser descartada (a API recusa).
            !job.application && (
              <button
                type="button"
                className={styles.iconButton}
                aria-label={`Descartar: ${job.title}`}
                title="Descartar"
                onClick={() => onTriage(job, 'dismissed')}
              >
                <X size={16} aria-hidden="true" />
              </button>
            )
          )}

          <button
            type="button"
            className={styles.iconButton}
            aria-label={`Ver detalhes: ${job.title}`}
            title="Ver detalhes"
            onClick={() => onOpen(job)}
          >
            <Eye size={16} aria-hidden="true" />
          </button>

          {job.url && (
            <a
              href={job.url}
              target="_blank"
              rel="noreferrer noopener"
              className={styles.iconButton}
              aria-label={`Abrir no site (nova aba): ${job.title}`}
              title="Abrir no site"
            >
              <ExternalLink size={16} aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
