import type { EmailAlertSite, JobPosting } from '@busca-vagas/shared';
import type { AlertSite } from './alert-tools';
import { isAuthentic, type MailMessage } from './message';
import { glassdoorSite } from './sites/glassdoor';
import { indeedSite } from './sites/indeed';
import { linkedinSite } from './sites/linkedin';

/** Os sites cujos alertas o app sabe ler. */
export const ALERT_SITES: readonly AlertSite[] = [linkedinSite, indeedSite, glassdoorSite];

export type AlertOutcome =
  | { kind: 'alert'; site: EmailAlertSite; jobs: JobPosting[]; dropped: number }
  | {
      kind: 'ignored';
      reason: 'unknown-sender' | 'not-authentic' | 'no-jobs';
      site?: EmailAlertSite;
    };

/**
 * Um e-mail do marcador → as vagas dele. Nunca lança: e-mail que não é
 * alerta (outro remetente, notificação do LinkedIn sem vaga, remetente que o
 * provedor não confirmou) vira `ignored` com o motivo.
 */
export function readAlert(message: MailMessage): AlertOutcome {
  const site = ALERT_SITES.find((candidate) => candidate.accepts(message));
  if (!site) return { kind: 'ignored', reason: 'unknown-sender' };
  // Alguém pode mandar um e-mail com "From: LinkedIn" para pôr vaga falsa no
  // app: só vale o que o seu provedor confirmou que veio do site.
  if (!isAuthentic(message, site.domains)) {
    return { kind: 'ignored', reason: 'not-authentic', site: site.id };
  }

  const { jobs, dropped } = site.read(message);
  if (jobs.length === 0 && dropped === 0) {
    return { kind: 'ignored', reason: 'no-jobs', site: site.id };
  }
  return { kind: 'alert', site: site.id, jobs, dropped };
}
