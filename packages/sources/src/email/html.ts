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

/**
 * Tira comentários e `<script>`/`<style>`/`<head>`/`<title>` com indexOf, em
 * tempo linear: as regexes com `[\s\S]*?` voltavam ao fim do texto a cada
 * abertura sem fechamento. Sem fechamento, o resto fica (como antes).
 */
function stripHidden(html: string): string {
  const lower = html.toLowerCase();
  const opener = /<!--|<(script|style|head|title)\b[^<>]*>/g;
  const unclosed = new Set<string>();
  let out = '';
  let from = 0;
  for (let found = opener.exec(lower); found; found = opener.exec(lower)) {
    const close = found[1] ? `</${found[1]}` : '-->';
    if (unclosed.has(close)) continue;
    const end = lower.indexOf(close, opener.lastIndex);
    if (end === -1) {
      // Não há fechamento daqui em diante: nenhuma abertura igual depois terá.
      unclosed.add(close);
      continue;
    }
    const after = found[1] ? lower.indexOf('>', end) : end + close.length - 1;
    out += `${html.slice(from, found.index)} `;
    from = after === -1 ? html.length : after + 1;
    opener.lastIndex = from;
  }
  return out + html.slice(from);
}

export function htmlTokens(html: string): HtmlToken[] {
  const body = stripHidden(html);

  const tokens: HtmlToken[] = [];
  let href: string | null = null;
  // `[^<>]*`: um "<" sem ">" para no próximo "<", sem varrer o resto do texto.
  const pattern = /<(\/?)([a-z][a-z0-9]*|!)([^<>]*)>|([^<]+)/gi;

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
