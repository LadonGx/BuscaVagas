import { isRestrictedUrl } from '@busca-vagas/shared';
import { parseBoardUrl } from './boards/board-url';
import { HttpError, RedirectBlockedError, type HttpClient } from './http';
import { decodeEntities } from './normalize/text';
import { DEADLINE_TIME_ZONE, toIsoDeadline } from './normalize/values';

/**
 * "A vaga ainda está aberta?" — uma requisição por vaga, pelo jeito certo de
 * cada lugar. Nunca lança: falha de rede vira `unknown`.
 * Plano: docs/features/13-availability.md
 */

export type AvailabilityState = 'open' | 'closed' | 'unknown';

export interface AvailabilityResult {
  state: AvailabilityState;
  /** Por quê, em PT-BR, para a tela ("Saiu do board da empresa", "A página diz: vaga encerrada"). */
  reason: string;
}

export interface AvailabilityTarget {
  source: string;
  url: string | null;
  externalId: string | null;
  /** Slug da empresa nos boards (Greenhouse, Lever, Ashby). */
  board: string | null;
}

/**
 * Sites cujos termos proíbem acesso automatizado (lista em
 * `@busca-vagas/shared`, RESTRICTED_SITES): não conferimos, nem com uma
 * requisição só.
 */
export const isRestrictedHost = isRestrictedUrl;

/**
 * Frases INTEIRAS de vaga fechada nas páginas (Gupy, sites de carreira, ATS).
 * "Esta vaga não está disponível para PcD" não conta: precisa do "mais", de
 * "encerrada" ou de "não existe".
 */
const CLOSED_TEXT = new RegExp(
  [
    'vaga (foi )?encerrada',
    '(esta )?vaga n[aã]o est[aá] mais (dispon[ií]vel|aberta|ativa)',
    '(esta )?vaga n[aã]o existe( mais)?',
    'vaga (est[aá] )?indispon[ií]vel(?! (para|pra|a|ao|aos|em|no|na)\\b)',
    'inscri[cç][oõ]es (foram |est[aã]o )?encerradas',
    'processo seletivo (foi |est[aá] )?encerrado',
    'n[aã]o (est[aá] mais |estamos mais )?(aceitando|recebendo) (mais )?(candidaturas|inscri[cç][oõ]es)',
    'this job is no longer available',
    'job (posting )?(is )?no longer available',
    'this job (posting )?(has )?(expired|closed|been closed)',
    'job (posting )?(is )?closed',
    'position (has been )?(filled|closed)',
    'no longer accepting applications',
  ]
    .map((phrase) => `\\b${phrase}\\b`)
    .join('|'),
  'i',
);

/** `"validThrough": "2026-10-01..."` do JSON-LD `JobPosting`; só a data = até o fim do dia. */
function validThrough(html: string): Date | null {
  const found = /"validThrough"\s*:\s*"([^"]+)"/.exec(html);
  if (!found) return null;
  const iso = toIsoDeadline(found[1]!);
  return iso ? new Date(iso) : null;
}

const pageText = (html: string) =>
  decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  );

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));
const unknownFrom = (error: unknown): AvailabilityResult => ({
  state: 'unknown',
  reason: `Não deu para conferir agora (${describe(error)})`,
});
const isGone = (error: unknown) =>
  error instanceof HttpError && (error.status === 404 || error.status === 410);

async function checkApi(url: string, http: HttpClient, where: string): Promise<AvailabilityResult> {
  try {
    await http.getJson(url);
    return { state: 'open', reason: `Está no ${where}` };
  } catch (error) {
    if (isGone(error)) return { state: 'closed', reason: `Saiu do ${where}` };
    return unknownFrom(error);
  }
}

async function checkPage(url: string, http: HttpClient, now: Date): Promise<AvailabilityResult> {
  let html: string;
  try {
    // Link encurtado ou de empresa pode redirecionar para o LinkedIn & cia.: cada salto é conferido antes.
    html = await http.getText(url, { allowRedirect: (next) => !isRestrictedHost(next) });
  } catch (error) {
    if (error instanceof RedirectBlockedError) {
      return {
        state: 'unknown',
        reason:
          'O link leva a um site que não permite conferência automática: abra o link para ver',
      };
    }
    if (isGone(error)) return { state: 'closed', reason: 'A página da vaga não existe mais' };
    return unknownFrom(error);
  }

  const until = validThrough(html);
  if (until && until < now) {
    return {
      state: 'closed',
      reason: `Inscrições até ${until.toLocaleDateString('pt-BR', { timeZone: DEADLINE_TIME_ZONE })}`,
    };
  }
  const closed = CLOSED_TEXT.exec(pageText(html));
  if (closed) return { state: 'closed', reason: `A página diz: "${closed[0]}"` };
  return { state: 'open', reason: 'A página da vaga está no ar' };
}

export async function checkAvailability(
  target: AvailabilityTarget,
  http: HttpClient,
  now: Date = new Date(),
): Promise<AvailabilityResult> {
  const fromUrl = target.url ? parseBoardUrl(target.url) : null;
  const board = target.board ?? (fromUrl?.sourceId === target.source ? fromUrl.slug : null);
  const id = target.externalId ? encodeURIComponent(target.externalId) : null;

  if (board && id) {
    const slug = encodeURIComponent(board);
    switch (target.source) {
      case 'greenhouse':
        return checkApi(
          `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${id}`,
          http,
          'board da empresa no Greenhouse',
        );
      case 'lever':
        return checkApi(
          `https://api.lever.co/v0/postings/${slug}/${id}`,
          http,
          'board da empresa no Lever',
        );
      case 'ashby':
        try {
          const body = (await http.getJson(
            `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
          )) as { jobs?: { id?: string }[] };
          const listed = (body.jobs ?? []).some((job) => job.id === target.externalId);
          return listed
            ? { state: 'open', reason: 'Está no board da empresa no Ashby' }
            : { state: 'closed', reason: 'Saiu do board da empresa no Ashby' };
        } catch (error) {
          return unknownFrom(error);
        }
    }
  }

  if (!target.url) {
    return { state: 'unknown', reason: 'Vaga sem link: não há o que conferir' };
  }
  if (isRestrictedHost(target.url)) {
    return {
      state: 'unknown',
      reason: 'Este site não permite conferência automática: abra o link para ver',
    };
  }
  return checkPage(target.url, http, now);
}
