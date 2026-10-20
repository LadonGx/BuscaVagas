import { z } from 'zod';
import type { JobDto } from './jobs';

/**
 * Extensão do Chrome (docs/features/21-extension.md): você manda para o app a
 * vaga que está vendo no navegador.
 */

/**
 * Sites cujos termos proíbem acesso automatizado (pesquisa da Fase 3,
 * docs/ROADMAP.md). O app nunca acessa esses sites, e a extensão não lê as
 * páginas deles: só o link e o título da aba, que o próprio navegador informa.
 */
export const RESTRICTED_SITES = [
  'linkedin.com',
  'lnkd.in',
  'indeed.com',
  'glassdoor.com',
  'glassdoor.com.br',
  'infojobs.com.br',
  'vagas.com.br',
  'vagas.com',
] as const;

/**
 * Marcas bloqueadas em QUALQUER domínio de país (glassdoor.co.uk,
 * indeed.com.br, de.indeed.com, infojobs.net...): a marca seguida só do
 * sufixo ("com", "co.uk", "com.br", "de").
 */
const RESTRICTED_BRANDS = ['linkedin', 'indeed', 'glassdoor', 'infojobs'] as const;
const COUNTRY_SUFFIX = /^[a-z]{2,3}(\.[a-z]{2})?$/;

/** Host em minúsculas e sem o ponto final ("www.linkedin.com." vale o mesmo). */
const hostOf = (url: string): string | null => {
  try {
    return new URL(url.trim()).hostname.toLowerCase().replace(/\.+$/, '') || null;
  } catch {
    return null;
  }
};

const isOnDomain = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** O host é da marca, em qualquer país? (`br.indeed.com`, `www.glassdoor.co.uk`). */
const isBrandHost = (host: string, brand: string) => {
  const labels = host.split('.');
  return labels.some(
    (label, index) => label === brand && COUNTRY_SUFFIX.test(labels.slice(index + 1).join('.')),
  );
};

const isRestrictedHostname = (host: string) =>
  RESTRICTED_SITES.some((site) => isOnDomain(host, site)) ||
  RESTRICTED_BRANDS.some((brand) => isBrandHost(host, brand));

/** O link é de um site que não permite acesso automatizado? */
export function isRestrictedUrl(url: string): boolean {
  const host = hostOf(url);
  return Boolean(host && isRestrictedHostname(host));
}

/**
 * Link da vaga na forma que cada site usa para UMA vaga, sem a navegação em
 * volta. Assim a vaga aberta no navegador bate com a que veio do alerta por
 * e-mail (docs/features/20-email-alerts.md):
 *
 *  - LinkedIn: `/jobs/view/<id>` (também a vaga aberta na lista, `?currentJobId=<id>`);
 *  - Glassdoor: `/job-listing/j?jl=<id>`;
 *  - Indeed: `/viewjob?jk=<id>`.
 *
 * Qualquer outro link volta como veio.
 */
export function siteJobUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return raw;
  }
  const host = url.hostname.toLowerCase().replace(/\.+$/, '');

  if (isBrandHost(host, 'linkedin')) {
    const id =
      /\/jobs\/view\/(?:[^/]*-)?(\d+)/.exec(url.pathname)?.[1] ??
      url.searchParams.get('currentJobId');
    if (id && /^\d+$/.test(id)) return `https://www.linkedin.com/jobs/view/${id}`;
  }
  if (isBrandHost(host, 'glassdoor')) {
    const id = url.searchParams.get('jl') ?? url.searchParams.get('jobListingId');
    if (id && /^\d+$/.test(id)) return `https://${host}/job-listing/j?jl=${id}`;
  }
  if (isBrandHost(host, 'indeed')) {
    const id = url.searchParams.get('jk') ?? url.searchParams.get('vjk');
    if (id && /^[a-z0-9]+$/i.test(id)) return `https://${host}/viewjob?jk=${id}`;
  }
  return url.toString();
}

/** `GET /api/jobs/lookup`: a vaga deste link (ou a mesma vaga, vinda de outra fonte) já está no app? */
export const jobLookupQuerySchema = z.object({
  url: z.url({ protocol: /^https?$/ }).max(2000),
  title: z.string().trim().max(200).optional(),
  company: z.string().trim().max(200).optional(),
  location: z.string().trim().max(200).optional(),
});
export type JobLookupQuery = z.output<typeof jobLookupQuerySchema>;

export interface JobLookupDto {
  /**
   * `link`: o mesmo link (ou um dos outros links da vaga); `same`: mesma
   * empresa, título e lugar, vinda de outra fonte; `null`: não está no app.
   */
  match: 'link' | 'same' | null;
  job: JobDto | null;
  /** Endereço da vaga no app, para abrir numa aba. */
  openUrl: string | null;
}
