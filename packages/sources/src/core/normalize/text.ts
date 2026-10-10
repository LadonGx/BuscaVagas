/**
 * Utilidades de texto usadas por todas as fontes.
 */

/** Minúsculas, sem acento, espaços colapsados. Base das comparações. */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  bull: '•',
  middot: '·',
  aacute: 'á',
  agrave: 'à',
  acirc: 'â',
  atilde: 'ã',
  eacute: 'é',
  ecirc: 'ê',
  iacute: 'í',
  oacute: 'ó',
  ocirc: 'ô',
  otilde: 'õ',
  uacute: 'ú',
  ccedil: 'ç',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  Ccedil: 'Ç',
  Atilde: 'Ã',
  Otilde: 'Õ',
};

/** Decodifica entidades HTML (`&amp;`, `&#233;`...). Exportada para HTML que chega escapado. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code =
        entity[1] === 'x' || entity[1] === 'X'
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000
        ? String.fromCodePoint(code)
        : match;
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

/**
 * HTML de descrição de vaga → texto puro legível.
 *
 * Não é um parser de HTML: é o suficiente para descrição de vaga (parágrafos,
 * listas, quebras). Blocos viram quebra de linha, itens de lista viram "• ",
 * scripts/estilos somem, entidades são decodificadas e o resultado é cortado
 * em `maxLength` caracteres.
 */
export function htmlToText(html: string, maxLength = 4_000): string {
  const text = decodeEntities(
    html
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      // Tags de texto (negrito, link...) somem sem deixar espaço: "<b>Node</b>," -> "Node,".
      .replace(/<\/?(strong|b|em|i|u|span|a|font|small|mark|code)(\s[^>]*)?>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n• ')
      .replace(/<\/(p|div|h[1-6]|ul|ol|tr|section|article)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}
