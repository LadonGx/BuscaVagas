import { createHash } from 'node:crypto';
import type { EmailAlertSite, JobPosting, SalaryRange, WorkModel } from '@busca-vagas/shared';
import { seniorityFromTitle } from '../core/normalize/seniority';
import { stackFromText } from '../core/normalize/stack';
import { fold } from '../core/normalize/text';
import { buildSalary } from '../core/normalize/values';
import { contractFromText, workModelFromText } from '../core/normalize/work-model';
import type { MailMessage } from './message';

/** O que um leitor tira de um e-mail de alerta. */
export interface AlertRead {
  jobs: JobPosting[];
  /** Cartões de vaga que estavam no e-mail mas não deu para ler. */
  dropped: number;
}

/** Um site que manda alerta de vaga por e-mail. */
export interface AlertSite {
  id: EmailAlertSite;
  /** Domínios do remetente (e da assinatura DKIM). */
  domains: readonly string[];
  /** É um e-mail de VAGA deste site? (o LinkedIn manda de tudo). */
  accepts(message: MailMessage): boolean;
  read(message: MailMessage): AlertRead;
}

const MAX_DESCRIPTION = 600;

/**
 * Monta a vaga no formato do projeto. Senioridade, stack, contrato e
 * modalidade vêm do título e do local, como nas outras fontes.
 */
export function alertPosting(
  site: EmailAlertSite,
  input: {
    externalId: string;
    url: string;
    title: string;
    company: string;
    location: string | null;
    /** Texto com a modalidade, quando o e-mail diz ("Remoto", "Híbrido"). */
    mode?: string | null;
    description?: string | null;
    salary?: SalaryRange | null;
    postedAt?: Date | null;
  },
): JobPosting {
  const workModel: WorkModel | null =
    workModelFromText(input.mode) ?? workModelFromText(`${input.title} ${input.location ?? ''}`);
  const description = input.description?.trim() || null;
  return {
    source: site,
    externalId: input.externalId,
    url: input.url,
    title: input.title,
    company: input.company,
    description:
      description && description.length > MAX_DESCRIPTION
        ? `${description.slice(0, MAX_DESCRIPTION - 1).trimEnd()}…`
        : description,
    location: input.location?.trim() || null,
    workModel,
    contractType: contractFromText(input.title),
    seniority: seniorityFromTitle(input.title),
    stack: stackFromText(input.title, description),
    salary: input.salary ?? null,
    postedAt: input.postedAt ? input.postedAt.toISOString() : null,
  };
}

/**
 * Id estável para quem não manda id no e-mail (o Indeed só manda links de
 * rastreio, diferentes a cada envio): empresa + título + local.
 */
export function contentId(...parts: (string | null)[]): string {
  const key = parts.map((part) => fold(part ?? '')).join('|');
  return createHash('sha256').update(key).digest('hex').slice(0, 24);
}

/**
 * "Brasil (Remoto)" → `{ place: 'Brasil', mode: 'Remoto' }`; "Trabalho
 * remoto" → `{ place: '', mode: 'Trabalho remoto' }`.
 */
export function splitMode(location: string): { place: string; mode: string | null } {
  const found = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(location);
  if (found && workModelFromText(found[2])) {
    return { place: found[1]!.trim(), mode: found[2]!.trim() };
  }
  const text = location.trim();
  const mode = workModelFromText(text) ? text : null;
  // "Trabalho remoto", "Remoto", "Home office": é a modalidade, não um lugar.
  return { place: mode && ONLY_MODE.test(fold(text)) ? '' : text, mode };
}

const ONLY_MODE =
  /^(trabalho |vaga )?(remoto|remota|100% remoto|home office|hibrido|hibrida|presencial|remote|hybrid|on-?site)$/;

/**
 * "há 5 dias", "4 dia(s)", "30+ dias", "24h", "hoje", "Novo" → data
 * aproximada da publicação, contada a partir do envio do e-mail.
 */
export function postedFromAge(text: string, sentAt: Date | null): Date | null | undefined {
  if (!sentAt) return null;
  const value = fold(text);
  const DAY = 86_400_000;
  const days = /^(?:ha\s+)?(\d+)\+?\s*(?:dias?|dia\(s\)|d)\+?$/.exec(value);
  if (days) return new Date(sentAt.getTime() - Number(days[1]) * DAY);
  const hours = /^(?:ha\s+)?(\d+)\s*(?:h|horas?)$/.exec(value);
  if (hours) return new Date(sentAt.getTime() - Number(hours[1]) * 3_600_000);
  if (/^(hoje|novo|nova|agora|publicada hoje|just posted)$/.test(value)) return sentAt;
  return undefined;
}

/** O texto é uma idade de anúncio ("há 5 dias", "4 dia(s)")? */
export const isAge = (text: string) => postedFromAge(text, new Date(0)) !== undefined;

const parseBrl = (amount: string, thousands: boolean) => {
  const number = Number(amount.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(number) ? number * (thousands ? 1000 : 1) : null;
};

/**
 * Salário em reais como os alertas escrevem: "R$ 4 mil", "R$ 3 mil - R$ 5
 * mil", "R$ 2.500 - R$ 3.000 por mês", "R$ 60 mil por ano", "R$ 25 por hora".
 */
export function salaryFromText(text: string): SalaryRange | null {
  const value = text.replace(/\u00a0/g, ' ');
  const amounts = [...value.matchAll(/R\$\s*([\d.,]+)\s*(mil\b|k\b)?/gi)].map((match) =>
    parseBrl(match[1]!, Boolean(match[2])),
  );
  if (amounts.length === 0 || amounts.some((amount) => amount === null)) return null;
  const folded = fold(value);
  const period = /\b(ano|anual|year)\b/.test(folded)
    ? 'year'
    : /\b(hora|hour)\b/.test(folded)
      ? 'hour'
      : 'month';
  return buildSalary({
    min: amounts[0],
    max: amounts[1] ?? amounts[0],
    currency: 'BRL',
    period,
  });
}
