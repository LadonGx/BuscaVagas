import type { SourceDefinition } from '../core/job-source';
import { emailInactiveReason, parseEmailConfig, type EmailConfig } from './email.config';
import { EMAIL_SOURCE_ID, EmailSource } from './email.source';

/** Alertas de vaga por e-mail, vistos de fora — é só isso que o registro importa. */
export const emailSourceDefinition: SourceDefinition<EmailConfig> = {
  id: EMAIL_SOURCE_ID,
  displayName: 'Alertas por e-mail',
  kind: 'mailbox',
  parseConfig: parseEmailConfig,
  inactiveReason: emailInactiveReason,
  create: (config) => new EmailSource(config),
};

export { EmailSource, EMAIL_SOURCE_ID } from './email.source';
export { parseEmailConfig, type EmailConfig } from './email.config';
export { readAlert, ALERT_SITES, type AlertOutcome } from './alerts';
export { parseMessage, type MailMessage } from './message';
export type { MailboxReader, MailboxRead } from './mailbox';
