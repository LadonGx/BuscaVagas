import {
  APPLICATION_STATUS_LABELS,
  TRIAGE_LABELS,
  type JobDto,
  type JobOccurrenceDto,
} from '@busca-vagas/shared';
import { ExternalLink } from 'lucide-react';
import { useId } from 'react';
import { Link, useLocation } from 'react-router';
import { useSourceName } from '../../api/discovery';
import { useJobHistory, useMuteReposts } from '../../api/jobs';
import { JobFlags } from '../../components/job/JobFlags';
import { useToast } from '../../components/toast/toast-context';
import { formatDate } from '../../lib/format';
import styles from './JobDrawer.module.css';

/** "Descartada em 10/09", "Apagada pela limpeza em 02/08 (descartada)". */
export function occurrenceStatus(item: JobOccurrenceDto): string {
  if (item.triage === 'forgotten') {
    return `Descartada; apagada pela limpeza em ${formatDate(item.lastSeenAt)}`;
  }
  if (item.application) {
    return `${APPLICATION_STATUS_LABELS[item.application.status]} · candidatura em ${formatDate(item.application.appliedAt)}`;
  }
  if (item.triage === 'inbox') return 'Ficou na caixa, sem triar';
  const label = TRIAGE_LABELS[item.triage];
  return item.triagedAt ? `${label} em ${formatDate(item.triagedAt)}` : label;
}

/** "Vista de 02/09 a 20/09" — ou só a última vez, nas apagadas. */
export function occurrenceWhen(item: JobOccurrenceDto): string {
  if (!item.firstSeenAt) return `Vista até ${formatDate(item.lastSeenAt)}`;
  const from = formatDate(item.firstSeenAt);
  const to = formatDate(item.lastSeenAt);
  return from === to ? `Vista em ${from}` : `Vista de ${from} a ${to}`;
}

/**
 * Repostagem e outras fontes, no painel da vaga (docs/features/11-reposts.md):
 * os outros links, as vezes em que ela já apareceu e "descartar sempre".
 */
export function JobHistory({ job }: { job: JobDto }) {
  const sourceName = useSourceName();
  const relevant = Boolean(job.repost) || job.alsoOn.length > 0 || job.triage === 'dismissed';
  const history = useJobHistory(job.id, relevant);
  const mute = useMuteReposts(job.id);
  const toast = useToast();
  const location = useLocation();
  const switchId = useId();

  if (!relevant) return null;

  const occurrences = history.data?.occurrences ?? [];
  const applied = occurrences.find((item) => item.application);
  const muted = history.data?.repostsMuted ?? false;
  /** Abre outra vaga no mesmo painel, mantendo a tela e os filtros. */
  const openHref = (id: string) => {
    const params = new URLSearchParams(location.search);
    params.set('vaga', id);
    return `${location.pathname}?${params.toString()}`;
  };

  return (
    <section className={styles.block} aria-labelledby={`${switchId}-titulo`}>
      <h3 id={`${switchId}-titulo`} className={styles.label}>
        {job.repost || job.alsoOn.length > 0 ? 'Outros links e repostagens' : 'Se for repostada'}
      </h3>
      {/* Os outros links já aparecem abaixo, um por linha. */}
      <JobFlags job={{ repost: job.repost, alsoOn: [] }} sourceName={sourceName} />

      {applied?.application && (
        <p className={styles.warning} role="note">
          Você já se candidatou a esta vaga em {formatDate(applied.application.appliedAt)} (outro
          link). Confira em Candidaturas antes de mandar de novo.
        </p>
      )}

      {job.alsoOn.length > 0 && (
        <ul className={styles.history}>
          {job.alsoOn.map((item) => (
            <li key={item.url}>
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer noopener"
                className={styles.external}
              >
                <ExternalLink size={14} aria-hidden="true" />
                Também na {sourceName(item.source)} (nova aba)
              </a>
            </li>
          ))}
        </ul>
      )}

      {history.isError && <p className={styles.muted}>{history.error.message}</p>}
      {occurrences.length > 0 && (
        <ol className={styles.history} aria-label="Já apareceu antes">
          {occurrences.map((item) => (
            <li key={item.url ?? item.jobId} className={styles.occurrence}>
              <span>
                <strong>{occurrenceWhen(item)}</strong> · via {sourceName(item.source)}
              </span>
              <span className={styles.muted}>{occurrenceStatus(item)}</span>
              {item.jobId ? (
                <Link to={openHref(item.jobId)} className={styles.occurrenceLink}>
                  Abrir essa vaga
                </Link>
              ) : (
                item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={styles.occurrenceLink}
                  >
                    Link antigo (nova aba)
                  </a>
                )
              )}
            </li>
          ))}
        </ol>
      )}

      {job.triage === 'dismissed' && (
        <label className={styles.muteRow} htmlFor={switchId}>
          <input
            id={switchId}
            type="checkbox"
            role="switch"
            className={styles.switch}
            checked={muted}
            disabled={history.isPending || mute.isPending}
            onChange={(event) =>
              mute.mutate(event.target.checked, {
                onSuccess: (result) =>
                  toast.show({
                    message: result.repostsMuted
                      ? 'Se esta vaga for repostada, ela já entra descartada.'
                      : 'Repostagens desta vaga voltam a entrar na caixa.',
                  }),
                onError: (error) => toast.show({ tone: 'error', message: error.message }),
              })
            }
          />
          <span>
            Descartar sozinha se for repostada
            <span className={styles.muted}>
              {' '}
              — sem marcar, a repostagem volta para a caixa com o selo "Repostada".
            </span>
          </span>
        </label>
      )}
    </section>
  );
}
