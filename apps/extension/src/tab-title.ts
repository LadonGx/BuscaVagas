import { workModelFromText, type Draft } from './draft';

/**
 * Nos sites restritos (LinkedIn, Indeed, Glassdoor, InfoJobs, Vagas.com) a
 * extensão não lê a página: só o título da aba, que é o navegador que
 * informa. Daqui sai um palpite de título, empresa e local para você
 * conferir. Formatos comuns:
 *
 *   "(3) Desenvolvedor Júnior | wevy | LinkedIn"
 *   "wevy está contratando Desenvolvedor Júnior em Brasil | LinkedIn"
 *   "Desenvolvedor Full Stack - São Paulo, SP - Indeed.com"
 *   "Desenvolvedor | Acme | Glassdoor"
 *
 * Local, modalidade e descrição quase nunca estão no título da aba: vêm do
 * texto que você copia da página e cola na janelinha (pasted-text.ts).
 */

/** Nome do site no fim do título da aba. */
const SITE_SUFFIX =
  /\s*[|\-–—·]\s*(linkedin|indeed(\.com)?( brasil)?|glassdoor|infojobs|vagas\.com(\.br)?)\s*$/i;
/** "wevy está contratando Dev em Brasil" / "Acme hiring Dev in Brazil". */
const HIRING =
  /^(.+?)\s+(?:está contratando|esta contratando|contrata|is hiring|hiring)\s+(.+?)(?:\s+(?:em|in)\s+(.+))?$/i;

type Guess = Pick<Draft, 'title' | 'company' | 'location' | 'workModel'>;

export function guessFromTabTitle(tabTitle: string, url: string): Guess {
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  })();
  const cleaned = tabTitle
    .replace(/^\(\d+\+?\)\s*/, '')
    .replace(SITE_SUFFIX, '')
    .trim();

  let title: string;
  let company = '';
  let location: string;

  const hiring = HIRING.exec(cleaned);
  if (hiring) {
    company = hiring[1]!.trim();
    title = hiring[2]!.trim();
    location = hiring[3]?.trim() ?? '';
  } else {
    // "Título | Empresa": com "|", a empresa é o último pedaço e o resto é o
    // título, que pode ter "|" e "–" ("Dev Full Stack – Node.js | React Native").
    // Sem "|", o separador é " - " ("Título - Local - Indeed.com").
    const separator = /\s+\|\s+/.test(cleaned) ? /\s+\|\s+/g : /\s+[-–—]\s+/g;
    const cuts = [...cleaned.matchAll(separator)];
    const last = cuts.at(-1);
    if (/indeed\./i.test(host) && !cleaned.includes('|')) {
      title = cleaned.slice(0, cuts[0]?.index).trim();
      location = cuts[0]
        ? cleaned.slice(cuts[0].index + cuts[0][0].length, cuts[1]?.index).trim()
        : '';
    } else {
      title = cleaned.slice(0, last?.index).trim();
      company = last ? cleaned.slice(last.index + last[0].length).trim() : '';
      location = '';
    }
  }

  return { title, company, location, workModel: workModelFromText(`${title} ${location}`) };
}
