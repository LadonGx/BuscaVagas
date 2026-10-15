import type { JobPosting } from '@busca-vagas/shared';
import {
  alertPosting,
  contentId,
  isAge,
  postedFromAge,
  salaryFromText,
  splitMode,
  type AlertRead,
  type AlertSite,
} from '../alert-tools';
import { htmlTokens, type HtmlToken } from '../html';
import { domainOf, isDomain, type MailMessage } from '../message';

/**
 * Links de vaga do Indeed: o redirecionamento de rastreio do e-mail
 * (`engage.indeed.com/f/a/...`) ou, em formatos antigos, `indeed.com/rc/clk`,
 * `/viewjob` e `/pagead/clk`. O app guarda o link para VOCÊ abrir; ele mesmo
 * nunca abre (docs/ROADMAP.md, portais que não permitem coleta).
 */
const JOB_LINK =
  /^https:\/\/(?:engage\.indeed\.com\/f\/a\/|(?:[a-z]+\.)?indeed\.com\/(?:rc\/clk|viewjob|pagead\/clk|m\/viewjob))/i;
/** Nota da empresa ("4.2"). */
const RATING = /^\d[.,]\d$/;
/** Mais que isso entre o título e a idade do anúncio não é um cartão de vaga. */
const MAX_CARD_TOKENS = 8;

function readCard(title: HtmlToken, rest: HtmlToken[], sentAt: Date | null): JobPosting | null {
  const ageAt = rest.findIndex((token) => isAge(token.text));
  if (ageAt < 2) return null;
  const fields = rest.slice(0, ageAt).map((token) => token.text);
  const [company, ...others] = fields;
  const afterRating = RATING.test(others[0] ?? '') ? others.slice(1) : others;
  const [location, ...details] = afterRating;
  if (!company || !location) return null;

  const salaryLine = details.find((detail) => /R\$/.test(detail));
  const description = details.filter((detail) => detail !== salaryLine).join(' ');
  const { place, mode } = splitMode(location);

  return alertPosting('indeed', {
    // O link muda a cada e-mail: o id é a própria vaga (empresa + título + local).
    externalId: contentId(company, title.text, place),
    url: title.href!,
    title: title.text,
    company,
    location: place,
    mode,
    description,
    salary: salaryLine ? salaryFromText(salaryLine) : null,
    postedAt: postedFromAge(rest[ageAt]!.text, sentAt) ?? null,
  });
}

/**
 * Indeed: cada cartão é "Título (link) / Empresa / nota / Local / [salário] /
 * resumo / há N dias". O fim do cartão é a idade do anúncio.
 */
export const indeedSite: AlertSite = {
  id: 'indeed',
  domains: ['indeed.com'],
  accepts: (message: MailMessage) => isDomain(domainOf(message.from), 'indeed.com'),
  read(message: MailMessage): AlertRead {
    const tokens = htmlTokens(message.html);
    const jobs: JobPosting[] = [];
    const ids = new Set<string>();
    let dropped = 0;

    tokens.forEach((token, index) => {
      if (!token.href || !JOB_LINK.test(token.href)) return;
      const rest: HtmlToken[] = [];
      for (const after of tokens.slice(index + 1, index + 1 + MAX_CARD_TOKENS)) {
        if (after.href && JOB_LINK.test(after.href)) break;
        rest.push(after);
      }
      // Botões e rodapé também são links do Indeed: só conta como vaga
      // perdida o que tem cara de cartão (empresa e idade logo abaixo).
      const job = readCard(token, rest, message.date);
      if (!job) {
        if (rest.some((item) => isAge(item.text))) dropped += 1;
        return;
      }
      if (ids.has(job.externalId!)) return;
      ids.add(job.externalId!);
      jobs.push(job);
    });

    return { jobs, dropped };
  },
};
