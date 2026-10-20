/**
 * Links de board ↔ (fonte, slug). É o que deixa a pessoa colar o link da
 * página de vagas de uma empresa em vez de descobrir o slug sozinha.
 */

/** Ids das fontes de board (iguais aos `*_SOURCE_ID`). */
export type BoardSourceId = 'greenhouse' | 'lever' | 'ashby';

export const BOARD_SOURCE_IDS: readonly BoardSourceId[] = ['greenhouse', 'lever', 'ashby'];

export interface BoardRef {
  sourceId: BoardSourceId;
  slug: string;
}

/** Host → fonte, e onde fica o slug no caminho (índice do segmento). */
const HOSTS: { host: RegExp; sourceId: BoardSourceId; slugAt: (parts: string[]) => string }[] = [
  // boards.greenhouse.io/<slug>, job-boards.greenhouse.io/<slug>/jobs/123
  {
    host: /^(job-)?boards\.greenhouse\.io$/,
    sourceId: 'greenhouse',
    slugAt: (parts) => (parts[0] === 'embed' ? '' : (parts[0] ?? '')),
  },
  // boards-api.greenhouse.io/v1/boards/<slug>/jobs
  {
    host: /^boards-api\.greenhouse\.io$/,
    sourceId: 'greenhouse',
    slugAt: (parts) => (parts[1] === 'boards' ? (parts[2] ?? '') : ''),
  },
  // jobs.lever.co/<slug>/<id>
  { host: /^jobs\.lever\.co$/, sourceId: 'lever', slugAt: (parts) => parts[0] ?? '' },
  // api.lever.co/v0/postings/<slug>
  {
    host: /^api\.lever\.co$/,
    sourceId: 'lever',
    slugAt: (parts) => (parts[1] === 'postings' ? (parts[2] ?? '') : ''),
  },
  // jobs.ashbyhq.com/<slug>/<id>
  { host: /^jobs\.ashbyhq\.com$/, sourceId: 'ashby', slugAt: (parts) => parts[0] ?? '' },
  // api.ashbyhq.com/posting-api/job-board/<slug>
  {
    host: /^api\.ashbyhq\.com$/,
    sourceId: 'ashby',
    slugAt: (parts) => (parts[0] === 'posting-api' ? (parts[2] ?? '') : ''),
  },
];

const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/**
 * Reconhece o link de um board (página da empresa ou de uma vaga, ou a API).
 * Aceita sem `https://`. `null` quando não é Greenhouse, Lever nem Ashby.
 */
export function parseBoardUrl(input: string): BoardRef | null {
  const text = input.trim();
  if (!text) return null;

  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }

  const host = url.hostname
    .toLowerCase()
    .replace(/\.+$/, '')
    .replace(/^www\./, '');

  for (const item of HOSTS) {
    if (!item.host.test(host)) continue;
    // Só decodifica depois de saber que é um board: "%" solto (".../100%-remoto") não lança.
    const parts = decodePath(url.pathname);
    if (!parts) return null;
    // Board embutido no site da empresa: .../embed/job_board?for=<slug>
    const slug =
      item.sourceId === 'greenhouse' && parts[0] === 'embed'
        ? (url.searchParams.get('for') ?? '')
        : item.slugAt(parts);
    return SLUG.test(slug) ? { sourceId: item.sourceId, slug } : null;
  }
  return null;
}

/** Segmentos do caminho, decodificados; `null` se algum tem `%` inválido. */
function decodePath(pathname: string): string[] | null {
  try {
    return pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return null;
  }
}

/** Página pública do board, para abrir no navegador. */
export function boardPageUrl(sourceId: BoardSourceId, slug: string): string {
  const path = encodeURIComponent(slug);
  switch (sourceId) {
    case 'greenhouse':
      return `https://job-boards.greenhouse.io/${path}`;
    case 'lever':
      return `https://jobs.lever.co/${path}`;
    case 'ashby':
      return `https://jobs.ashbyhq.com/${path}`;
  }
}

export function isBoardSourceId(value: string): value is BoardSourceId {
  return (BOARD_SOURCE_IDS as readonly string[]).includes(value);
}
