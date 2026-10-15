import { decodeEntities } from '../core/normalize/text';

/**
 * Um pedaço de texto do HTML do e-mail, na ordem em que aparece, com o link
 * em volta dele (se houver).
 *
 * Os e-mails de alerta são tabelas aninhadas com classes que mudam a cada
 * envio: em vez de depender da estrutura, os leitores andam por esta lista
 * ("o título é um link para a vaga; logo depois vêm empresa e local").
 */
export interface HtmlToken {
  text: string;
  /** `href` do `<a>` em volta do texto, já decodificado. `null` = fora de link. */
  href: string | null;
}

/**
 * Caracteres invisíveis que os e-mails usam para enfeitar a prévia. O U+034F
 * (que combina com o anterior) fica numa alternativa à parte: dentro da
 * classe ele confundiria a leitura da regex.
 */
const INVISIBLE = /[\u00ad\u200b-\u200f\u2060-\u2064\ufeff]|\u034f/g;

export function cleanText(text: string): string {
  return decodeEntities(text)
    .replace(INVISIBLE, '')
    .replace(/[\s\u00a0]+/g, ' ')
    .trim();
}

export function htmlTokens(html: string): HtmlToken[] {
  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|head|title)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');

  const tokens: HtmlToken[] = [];
  let href: string | null = null;
  const pattern = /<(\/?)([a-z][a-z0-9]*|!)([^>]*)>|([^<]+)/gi;

  for (const match of body.matchAll(pattern)) {
    const [, closing, tag, attributes, raw] = match;
    if (raw !== undefined) {
      const text = cleanText(raw);
      if (text) tokens.push({ text, href });
      continue;
    }
    if (tag?.toLowerCase() !== 'a') continue;
    if (closing) {
      href = null;
      continue;
    }
    const found = /\bhref\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attributes ?? '');
    href = found ? decodeEntities((found[2] ?? found[3] ?? '').trim()) : null;
  }

  return tokens;
}
