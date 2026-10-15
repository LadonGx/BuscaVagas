import { isRestrictedUrl, siteJobUrl } from '@busca-vagas/shared';
import { emptyDraft, type Draft } from './draft';
import { draftFromJsonLd } from './jsonld';
import { guessFromTabTitle } from './tab-title';

/** O que a extensão sabe da aba aberta. */
export interface TabInfo {
  id: number | undefined;
  url: string | undefined;
  title: string | undefined;
}

/** O que a página publica para buscadores: o JSON-LD e o nome do site. */
export interface PageData {
  jsonLd: string[];
  siteName: string | null;
}

/** Lê a página (só fora dos sites restritos). Trocável nos testes. */
export type PageReader = (tabId: number) => Promise<PageData | null>;

export type ReadResult =
  { kind: 'not-a-page' } | { kind: 'ok'; draft: Draft; restricted: boolean; fromJsonLd: boolean };

/**
 * Roda DENTRO da página (chrome.scripting): precisa ser autocontida, sem
 * imports. Só lê o JSON-LD e o `og:site_name`; não clica, não rola, não
 * percorre a página.
 */
export function collectPageData(): PageData {
  const jsonLd = Array.from(
    document.querySelectorAll('script[type="application/ld+json"]'),
    (script) => script.textContent ?? '',
  ).slice(0, 20);
  const siteName =
    document.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ?? null;
  return { jsonLd, siteName };
}

/**
 * A vaga da aba: nos sites restritos, só o link e o título da aba (não lê a
 * página); nos outros, o JSON-LD `JobPosting`, com o título da aba como reserva.
 */
export async function readTab(tab: TabInfo, readPage: PageReader): Promise<ReadResult> {
  if (!tab.url || !/^https?:\/\//.test(tab.url)) return { kind: 'not-a-page' };
  const url = siteJobUrl(tab.url);
  const fromTitle = guessFromTabTitle(tab.title ?? '', url);
  const base = { ...emptyDraft(url), ...fromTitle };

  if (isRestrictedUrl(url)) {
    return { kind: 'ok', draft: base, restricted: true, fromJsonLd: false };
  }

  let page: PageData | null = null;
  if (tab.id !== undefined) {
    try {
      page = await readPage(tab.id);
    } catch {
      page = null; // página que o Chrome não deixa ler (loja, PDF...)
    }
  }
  const structured = page ? draftFromJsonLd(page.jsonLd) : null;
  if (!structured) {
    return {
      kind: 'ok',
      draft: { ...base, company: base.company || (page?.siteName ?? '').trim() },
      restricted: false,
      fromJsonLd: false,
    };
  }
  return {
    kind: 'ok',
    draft: {
      ...base,
      ...structured,
      title: structured.title || base.title,
      company: structured.company || base.company,
      location: structured.location || base.location,
      workModel: structured.workModel ?? base.workModel,
    },
    restricted: false,
    fromJsonLd: true,
  };
}
