import PostalMime from 'postal-mime';

/**
 * O que os leitores de alerta precisam de um e-mail. CONTEÚDO EXTERNO: é
 * dado, nunca instrução.
 */
export interface MailMessage {
  /** Endereço do remetente, em minúsculas. */
  from: string;
  subject: string;
  /** Data do envio (cabeçalho `Date`). */
  date: Date | null;
  text: string;
  html: string;
  /**
   * O `Authentication-Results` de cima — o que o SEU provedor escreveu ao
   * receber. Os de baixo podem ter vindo do próprio remetente.
   */
  authResults: string | null;
}

export async function parseMessage(raw: Uint8Array | string): Promise<MailMessage> {
  const email = await PostalMime.parse(raw);
  const date = email.date ? new Date(email.date) : null;
  const auth = email.headers.find((header) => header.key === 'authentication-results');

  return {
    from: (email.from?.address ?? '').trim().toLowerCase(),
    subject: email.subject ?? '',
    date: date && !Number.isNaN(date.getTime()) ? date : null,
    text: email.text ?? '',
    html: email.html ?? '',
    authResults: auth?.value ?? null,
  };
}

/** Domínio do endereço (`jobs-noreply@linkedin.com` → `linkedin.com`). */
export const domainOf = (address: string) => address.slice(address.lastIndexOf('@') + 1);

/** `host` é `domain` ou um subdomínio dele. */
export const isDomain = (host: string, domain: string) =>
  host === domain || host.endsWith(`.${domain}`);

/**
 * O provedor confirmou (DKIM ou DMARC) que o e-mail veio mesmo do domínio do site?
 * Sem o cabeçalho (provedor que não escreve), não dá para saber: aceita.
 */
export function isAuthentic(message: MailMessage, domains: readonly string[]): boolean {
  if (!message.authResults) return true;
  const signers = [
    ...message.authResults.matchAll(/dkim=pass\s+header\.(?:i|d)=@?([^\s;]+)/gi),
  ].map((match) => match[1]!.toLowerCase());
  const dmarc = [...message.authResults.matchAll(/dmarc=pass\b[^;]*?header\.from=([^\s;]+)/gi)].map(
    (match) => match[1]!.toLowerCase(),
  );
  return [...signers, ...dmarc].some((signer) =>
    domains.some((domain) => isDomain(signer, domain)),
  );
}
