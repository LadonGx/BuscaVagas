import type { JobPosting } from '@busca-vagas/shared';
import {
  alertPosting,
  salaryFromText,
  splitMode,
  type AlertRead,
  type AlertSite,
} from '../alert-tools';
import { htmlTokens } from '../html';
import { domainOf, isDomain, type MailMessage } from '../message';

/** `/jobs/view/4472559058` (com ou sem `/comm`) — o id é o da vaga no LinkedIn. */
const JOB_LINK = /^https?:\/\/(?:[a-z]+\.)?linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/i;
/** "Visualizar vaga: <link>" / "View job: <link>" no texto puro. */
const VIEW_LINE = /^(?:visualizar vaga|ver vaga|view job)\s*:\s*(\S+)/i;

const jobUrl = (id: string) => `https://www.linkedin.com/jobs/view/${id}`;

interface Card {
  id: string;
  title: string;
  company: string;
  location: string;
  extras: string[];
}

function toPosting(card: Card): JobPosting {
  const { place, mode } = splitMode(card.location);
  const salaryLine = card.extras.find((extra) => /R\$/.test(extra));
  return alertPosting('linkedin', {
    externalId: card.id,
    url: jobUrl(card.id),
    title: card.title,
    company: card.company,
    location: place,
    mode,
    salary: salaryLine ? salaryFromText(salaryLine) : null,
  });
}

/**
 * HTML: o título é um link para a vaga e o texto seguinte é
 * "Empresa · Local (Modalidade)". O link do cabeçalho ("Vagas semelhantes à
 * de X") também aponta para uma vaga, mas não é seguido por "·": fica de fora.
 */
function cardsFromHtml(html: string): Card[] {
  const tokens = htmlTokens(html);
  const cards: Card[] = [];
  const seen = new Set<string>();

  tokens.forEach((token, index) => {
    const id = token.href ? JOB_LINK.exec(token.href)?.[1] : undefined;
    const next = tokens[index + 1];
    if (!id || seen.has(id) || token.text.includes(' · ') || !next?.text.includes(' · ')) return;

    const [company, ...rest] = next.text.split(' · ');
    const extras: string[] = [];
    for (const after of tokens.slice(index + 2, index + 6)) {
      if (after.href && JOB_LINK.test(after.href)) break;
      extras.push(after.text);
    }
    seen.add(id);
    cards.push({
      id,
      title: token.text,
      company: company!.trim(),
      location: rest.join(' · ').trim(),
      extras,
    });
  });

  return cards;
}

/**
 * Texto puro (reserva, se o HTML mudar): blocos "Título / Empresa / Local /
 * Visualizar vaga: <link>" separados por "-----".
 */
function cardsFromText(text: string): { cards: Card[]; dropped: number } {
  const cards: Card[] = [];
  let dropped = 0;
  let block: string[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^-{5,}$/.test(line)) {
      block = [];
      continue;
    }
    const view = VIEW_LINE.exec(line);
    if (!view) {
      if (line) block.push(line);
      continue;
    }
    const id = JOB_LINK.exec(view[1]!)?.[1];
    const [title, company, location, ...extras] = block;
    block = [];
    if (!id || !title || !company) {
      dropped += 1;
      continue;
    }
    if (cards.some((card) => card.id === id)) continue;
    cards.push({ id, title, company, location: location ?? '', extras });
  }

  return { cards, dropped };
}

/**
 * LinkedIn: o mesmo remetente manda alerta de vaga, "vagas semelhantes",
 * sugestões e também conexões, posts e notícias. Todo e-mail do LinkedIn é
 * lido; o que não tem cartão de vaga conta como "ignorado".
 */
export const linkedinSite: AlertSite = {
  id: 'linkedin',
  domains: ['linkedin.com'],
  accepts: (message: MailMessage) => isDomain(domainOf(message.from), 'linkedin.com'),
  read(message: MailMessage): AlertRead {
    const fromHtml = message.html ? cardsFromHtml(message.html) : [];
    if (fromHtml.length > 0) return { jobs: fromHtml.map(toPosting), dropped: 0 };
    const { cards, dropped } = cardsFromText(message.text);
    return { jobs: cards.map(toPosting), dropped };
  },
};
