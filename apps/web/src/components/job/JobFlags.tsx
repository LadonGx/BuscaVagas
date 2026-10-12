import type { JobDto } from '@busca-vagas/shared';
import { formatDate } from '../../lib/format';
import styles from './Chips.module.css';

type FlagJob = Pick<JobDto, 'repost' | 'alsoOn'>;

export interface JobFlag {
  key: string;
  text: string;
  /** `warn` = merece atenção (você já se candidatou à anterior). */
  tone: 'info' | 'warn';
  /** Dica com o detalhe (data, o que você fez). */
  title: string;
}

/**
 * Selos de repostagem e de outras fontes — docs/features/11-reposts.md.
 * `sourceName` traduz o id da fonte ("greenhouse" → "Greenhouse").
 */
export function jobFlags(job: FlagJob, sourceName: (id: string) => string): JobFlag[] {
  const flags: JobFlag[] = [];
  const { repost } = job;

  if (repost) {
    const times = repost.count > 1 ? ` ${repost.count}×` : '';
    const previous = repost.previous;
    const did = previous?.application
      ? 'você já se candidatou'
      : previous?.triage === 'dismissed'
        ? 'você descartou'
        : previous?.triage === 'saved'
          ? 'você salvou'
          : null;
    const when = repost.previousSeenAt
      ? `; antes, vista até ${formatDate(repost.previousSeenAt)}`
      : '';
    flags.push({
      key: 'repost',
      text: `Repostada${times}${did ? ` · ${did}` : ''}`,
      tone: previous?.application ? 'warn' : 'info',
      title: `Já apareceu ${repost.count === 1 ? '1 vez' : `${repost.count} vezes`} com outro link${when}.`,
    });
  }

  if (job.alsoOn.length > 0) {
    const names = [...new Set(job.alsoOn.map((item) => sourceName(item.source)))];
    flags.push({
      key: 'also',
      text: names.length === 1 ? `Também na ${names[0]}` : `Em mais ${names.length} fontes`,
      tone: 'info',
      title: `A mesma vaga em: ${names.join(', ')}.`,
    });
  }

  return flags;
}

/** Linha de selos; nada quando a vaga é inédita e de uma fonte só. */
export function JobFlags({
  job,
  sourceName,
}: {
  job: FlagJob;
  sourceName: (id: string) => string;
}) {
  const flags = jobFlags(job, sourceName);
  if (flags.length === 0) return null;
  return (
    <ul className={styles.row} aria-label="Avisos da vaga">
      {flags.map((flag) => (
        <li key={flag.key} className={styles.flag} data-tone={flag.tone} title={flag.title}>
          {flag.text}
        </li>
      ))}
    </ul>
  );
}
