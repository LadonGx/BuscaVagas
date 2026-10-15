import type { EmailAlertSite, JobPosting } from '@busca-vagas/shared';
import type { JobSource, SourceContext, SourceQuery, SourceResult } from '../core/job-source';
import { readAlert, type AlertOutcome } from './alerts';
import type { EmailConfig } from './email.config';
import { imapReader, type MailboxReader } from './mailbox';
import { parseMessage } from './message';

export const EMAIL_SOURCE_ID = 'email';

const DAY_MS = 86_400_000;

const IGNORED_LABEL: Record<Extract<AlertOutcome, { kind: 'ignored' }>['reason'], string> = {
  'unknown-sender': 'de outro remetente',
  'not-authentic': 'sem confirmação do remetente',
  'no-jobs': 'sem vaga',
};

/**
 * Alertas de vaga por e-mail (docs/features/20-email-alerts.md).
 *
 * Lê o marcador dos últimos `lookbackDays` dias a cada vez e devolve as
 * vagas de TODOS os alertas da janela: a gravação já ignora o que conhece, e
 * o "visto por último" das vagas fica certo. Cada e-mail é baixado e lido
 * uma vez por processo (cache por `uidValidity:uid`).
 *
 * Nunca acessa LinkedIn, Indeed ou Glassdoor: só lê o seu e-mail.
 */
export class EmailSource implements JobSource {
  readonly id = EMAIL_SOURCE_ID;
  readonly displayName = 'Alertas por e-mail';
  readonly kind = 'mailbox' as const;
  readonly timeoutMs = 120_000;
  readonly scheduleEveryMs: number;

  private readonly cache = new Map<string, AlertOutcome>();

  constructor(
    private readonly config: EmailConfig,
    private readonly reader: MailboxReader = imapReader,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.scheduleEveryMs = config.intervalMinutes * 60_000;
  }

  async fetch(_query: SourceQuery, ctx: SourceContext): Promise<SourceResult> {
    const since = new Date(this.now().getTime() - this.config.lookbackDays * DAY_MS);
    const { keys, fresh } = await this.reader(this.config, {
      since,
      known: new Set(this.cache.keys()),
      signal: ctx.signal,
    });

    for (const { key, source } of fresh) {
      try {
        this.cache.set(key, readAlert(await parseMessage(source)));
      } catch {
        // E-mail que nem dá para abrir: conta como ignorado, não derruba a busca.
        this.cache.set(key, { kind: 'ignored', reason: 'no-jobs' });
      }
    }
    // Esquece o que saiu da janela.
    const window = new Set(keys);
    for (const key of [...this.cache.keys()]) if (!window.has(key)) this.cache.delete(key);

    const jobs: JobPosting[] = [];
    let dropped = 0;
    const bySite = new Map<EmailAlertSite, number>();
    const ignored = new Map<string, number>();
    for (const key of keys) {
      const outcome = this.cache.get(key);
      if (!outcome) continue;
      if (outcome.kind === 'ignored') {
        const label = IGNORED_LABEL[outcome.reason];
        ignored.set(label, (ignored.get(label) ?? 0) + 1);
        continue;
      }
      jobs.push(...outcome.jobs);
      dropped += outcome.dropped;
      bySite.set(outcome.site, (bySite.get(outcome.site) ?? 0) + 1);
    }

    // Vaga publicada há mais de EMAIL_MAX_AGE_DAYS (o alerta diz "há 45 dias",
    // "30d+"): provavelmente já fechou. Sem data (LinkedIn), fica.
    const maxAgeMs = this.config.maxAgeDays * DAY_MS;
    const unique = dedupeByUrl(jobs);
    const recent = unique.filter(
      (job) =>
        !maxAgeMs ||
        !job.postedAt ||
        this.now().getTime() - new Date(job.postedAt).getTime() <= maxAgeMs,
    );
    const tooOld = unique.length - recent.length;

    const sites = [...bySite].map(([site, count]) => `${site} ${count}`).join(', ');
    const skipped = [...ignored].map(([label, count]) => `${count} ${label}`).join(', ');
    ctx.log(
      `${this.id}: ${keys.length} e-mails em "${this.config.folder}" (${fresh.length} novos)` +
        (sites ? ` · alertas: ${sites}` : '') +
        (skipped ? ` · ignorados: ${skipped}` : '') +
        (tooOld
          ? ` · ${tooOld} vagas com mais de ${this.config.maxAgeDays} dias deixadas de fora`
          : ''),
    );

    return { jobs: recent, dropped, filtered: tooOld };
  }
}

/** O mesmo anúncio em dois alertas da janela entra uma vez só. */
function dedupeByUrl(jobs: JobPosting[]): JobPosting[] {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    const key = `${job.source}:${job.externalId ?? job.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
