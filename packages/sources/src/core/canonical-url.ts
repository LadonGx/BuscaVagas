/**
 * Forma canônica da URL de uma vaga — a chave de deduplicação do projeto.
 *
 * O mesmo anúncio chega com `?utm_source=...`, com `#apply`, com barra no
 * fim ou com o host em maiúsculas. Sem normalizar, cada variação vira uma
 * vaga "nova" e volta depois de descartada.
 *
 * Remove só parâmetros de rastreamento conhecidos: vários ATS identificam a
 * vaga pela query (o Greenhouse usa `gh_jid`), então limpar tudo quebraria
 * o link.
 */

const TRACKING_PARAMS = new Set([
  'gclid',
  'fbclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'ref',
  'refid',
  'trk',
  'trackingid',
]);

export function canonicalUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null;
  }

  url.hash = '';
  url.hostname = url.hostname.toLowerCase();

  for (const key of [...url.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (lower.startsWith('utm_') || TRACKING_PARAMS.has(lower)) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();

  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }

  return url.toString();
}
