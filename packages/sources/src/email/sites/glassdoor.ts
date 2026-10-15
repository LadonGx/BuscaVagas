import type { JobPosting } from '@busca-vagas/shared';
import {
  alertPosting,
  isAge,
  postedFromAge,
  salaryFromText,
  splitMode,
  type AlertRead,
  type AlertSite,
} from '../alert-tools';
import { htmlTokens, type HtmlToken } from '../html';
import { domainOf, isDomain, type MailMessage } from '../message';

/** Cartão de vaga: link com `jobListingId` (id da vaga no Glassdoor). */
function listingId(href: string | null): string | null {
  if (!href) return null;
  try {
    const url = new URL(href);
    if (!isDomain(url.hostname, 'glassdoor.com') && !isDomain(url.hostname, 'glassdoor.com.br')) {
      return null;
    }
    const id = url.searchParams.get('jobListingId') ?? url.searchParams.get('jl');
    return id && /^\d+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** "4.3 ★" */
const RATING = /^\d[.,]\d\s*★?$/;
/** Selos que não são dado da vaga. */
const BADGES = /^(candidatura (rapida|rápida|simplificada)|easy apply|\(|\)|estimativa d[ao] .*)$/i;

function readCard(
  id: string,
  host: string,
  texts: string[],
  sentAt: Date | null,
): JobPosting | null {
  const [company, ...others] = texts;
  const afterRating = RATING.test(others[0] ?? '') ? others.slice(1) : others;
  const [title, location, ...details] = afterRating;
  if (!company || !title || !location) return null;

  const salaryText = details.filter((detail) => !BADGES.test(detail)).find((d) => /R\$/.test(d));
  const age = details.find(isAge);
  const { place, mode } = splitMode(location);

  return alertPosting('glassdoor', {
    externalId: id,
    url: `https://${host}/job-listing/j?jl=${id}`,
    title,
    company,
    location: place,
    mode,
    salary: salaryText ? salaryFromText(salaryText) : null,
    postedAt: age ? (postedFromAge(age, sentAt) ?? null) : null,
  });
}

/**
 * Glassdoor: o cartão inteiro é um link, com "Empresa / nota / Título /
 * Local / [salário] / [selo] / N dia(s)" dentro.
 */
export const glassdoorSite: AlertSite = {
  id: 'glassdoor',
  domains: ['glassdoor.com', 'glassdoor.com.br'],
  accepts: (message: MailMessage) =>
    ['glassdoor.com', 'glassdoor.com.br'].some((domain) =>
      isDomain(domainOf(message.from), domain),
    ),
  read(message: MailMessage): AlertRead {
    // Os textos de cada cartão, agrupados pelo id da vaga, na ordem do e-mail.
    const groups = new Map<string, { host: string; texts: string[] }>();
    let current: string | null = null;
    for (const token of htmlTokens(message.html) as HtmlToken[]) {
      const id = listingId(token.href);
      if (!id) {
        current = null;
        continue;
      }
      if (id !== current && groups.has(id)) {
        current = null; // o mesmo link de novo (ex.: botão): não mistura
        continue;
      }
      current = id;
      const group = groups.get(id) ?? { host: new URL(token.href!).hostname, texts: [] };
      group.texts.push(token.text);
      groups.set(id, group);
    }

    const jobs: JobPosting[] = [];
    let dropped = 0;
    for (const [id, { host, texts }] of groups) {
      const job = readCard(id, host, texts, message.date);
      if (job) jobs.push(job);
      else dropped += 1;
    }
    return { jobs, dropped };
  },
};
