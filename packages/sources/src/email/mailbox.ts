import { ImapFlow } from 'imapflow';
import type { EmailConfig } from './email.config';

export interface MailboxRead {
  /** Todas as mensagens da janela (`uidValidity:uid`), na ordem do servidor. */
  keys: string[];
  /** O conteúdo só das que ainda não foram lidas (fora de `known`). */
  fresh: { key: string; source: Uint8Array }[];
}

export interface MailboxQuery {
  since: Date;
  /** Mensagens já lidas: não baixa de novo. */
  known: ReadonlySet<string>;
  signal: AbortSignal;
}

/** Lê o marcador. Trocável nos testes (sem servidor IMAP). */
export type MailboxReader = (config: EmailConfig, query: MailboxQuery) => Promise<MailboxRead>;

/**
 * IMAP só leitura: abre o marcador com EXAMINE (o servidor não deixa mudar
 * nada) e baixa com BODY.PEEK (não marca como lido). Não move, não apaga,
 * não marca.
 */
export const imapReader: MailboxReader = async (config, { since, known, signal }) => {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user ?? '', pass: config.password ?? '' },
    logger: false,
    connectionTimeout: 30_000,
    socketTimeout: 60_000,
  });
  const abort = () => client.close();
  signal.addEventListener('abort', abort, { once: true });

  try {
    await client.connect();
    const mailbox = await client.mailboxOpen(config.folder, { readOnly: true });
    const uidValidity = String(mailbox.uidValidity);
    const uids = (await client.search({ since }, { uid: true })) || [];
    const keys = uids.map((uid) => `${uidValidity}:${uid}`);

    const missing = uids.filter((uid) => !known.has(`${uidValidity}:${uid}`));
    const fresh: MailboxRead['fresh'] = [];
    if (missing.length > 0) {
      const messages = await client.fetchAll(missing, { uid: true, source: true }, { uid: true });
      for (const message of messages) {
        if (message.source) {
          fresh.push({ key: `${uidValidity}:${message.uid}`, source: message.source });
        }
      }
    }

    await client.logout();
    return { keys, fresh };
  } catch (error) {
    client.close();
    throw new Error(describeImapError(error, config), { cause: error });
  } finally {
    signal.removeEventListener('abort', abort);
  }
};

/** Erro do IMAP → o que fazer, em PT-BR. Nunca repete a senha. */
export function describeImapError(error: unknown, config: EmailConfig): string {
  const details = error as {
    authenticationFailed?: boolean;
    serverResponseCode?: string;
    responseText?: string;
    code?: string;
    message?: string;
  };
  if (details.authenticationFailed || details.serverResponseCode === 'AUTHENTICATIONFAILED') {
    return `O e-mail recusou o login de ${config.user}. Confira EMAIL_USER e EMAIL_PASSWORD (no Gmail, use uma senha de app).`;
  }
  if (
    details.serverResponseCode === 'NONEXISTENT' ||
    /doesn't exist|nonexistent|unknown mailbox|invalid mailbox|no such mailbox|mailbox not found/i.test(
      details.responseText ?? details.message ?? '',
    )
  ) {
    return `Não achei o marcador "${config.folder}" no e-mail. Crie o marcador (ou ajuste EMAIL_FOLDER).`;
  }
  if (
    details.code === 'ENOTFOUND' ||
    details.code === 'ECONNREFUSED' ||
    details.code === 'ETIMEDOUT'
  ) {
    return `Não consegui conectar em ${config.host}:${config.port} (${details.code}).`;
  }
  return `Erro ao ler o e-mail: ${details.responseText ?? details.message ?? String(error)}`;
}
