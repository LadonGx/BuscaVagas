import type { ContractType, JobPosting, SeniorityLevel, WorkModel } from '@busca-vagas/shared';
import { canonicalUrl } from '../core/canonical-url';
import { seniorityFromTitle } from '../core/normalize/seniority';
import { stackFromText } from '../core/normalize/stack';
import { fold, htmlToText } from '../core/normalize/text';
import { gupyJobSchema, type GupyJob } from './gupy.schema';

export const GUPY_SOURCE_ID = 'gupy';

const MAX_DESCRIPTION = 4_000;

/**
 * Vaga da Gupy → `JobPosting`. Devolve `null` para o que não deve entrar:
 * banco de talentos, empresa confidencial, link fora da Gupy, sem título ou
 * sem empresa. `parseEach` conta esses como descartados.
 */
export function mapGupyJob(raw: unknown): JobPosting | null {
  const parsed = gupyJobSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }

  const job = parsed.data;
  const title = job.name.trim();
  const company = job.careerPageName?.trim() ?? '';

  const link = (job.jobUrl ?? job.url ?? '').trim();

  if (!title || !company || isConfidentialGupyJob({ ...job, jobUrl: link })) {
    return null;
  }

  const kind = gupyVacancyKind(job.type);
  // Banco de talentos não é vaga: não tem cargo definido nem processo aberto.
  if (kind === 'talent-pool') {
    return null;
  }

  if (!isGupyUrl(link)) {
    return null;
  }
  const url = canonicalUrl(link);
  if (!url) {
    return null;
  }

  const description = job.description ? htmlToText(job.description, MAX_DESCRIPTION) : null;

  return {
    source: GUPY_SOURCE_ID,
    externalId: job.id != null ? String(job.id) : null,
    url,
    title,
    company,
    description: description || null,
    location: gupyLocation(job),
    workModel: gupyWorkModel(job),
    contractType: kind.contract,
    seniority: kind.seniority ?? seniorityFromTitle(title),
    stack: stackFromText(title, description),
    salary: null,
    postedAt: toIsoDate(job.publishedDate),
  };
}

/* ------------------------------------------------------------- helpers */

/** Só aceita https em gupy.io ou *.gupy.io: o link vai ser aberto por você. */
export function isGupyUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && (host === 'gupy.io' || host.endsWith('.gupy.io'));
  } catch {
    return false;
  }
}

/**
 * Empresa anônima. O booleano `isConfidentialCareerPage` não vem mais na busca,
 * então valem as pistas que sobraram: nome "Confidencial", logo padrão de
 * confidencial ou subdomínio "confidencial(...)".
 */
export function isConfidentialGupyJob(
  job: Pick<GupyJob, 'isConfidentialCareerPage' | 'careerPageName' | 'careerPageLogo' | 'jobUrl'>,
): boolean {
  if (job.isConfidentialCareerPage === true) return true;
  if (fold(job.careerPageName ?? '').trim() === 'confidencial') return true;
  if (/confidencial_logo\.png$/i.test(job.careerPageLogo?.trim() ?? '')) return true;
  try {
    const host = new URL(job.jobUrl ?? '').hostname.toLowerCase();
    return host.split('.')[0]?.includes('confidencia') ?? false;
  } catch {
    return false;
  }
}

export function gupyWorkModel(
  job: Pick<GupyJob, 'workplaceType' | 'isRemoteWork'>,
): WorkModel | null {
  switch (job.workplaceType?.trim().toLowerCase()) {
    case 'remote':
      return 'remote';
    case 'hybrid':
      return 'hybrid';
    case 'on-site':
    case 'onsite':
      return 'onsite';
    default:
      // O campo vem vazio em parte das vagas; o booleano é a segunda pista.
      return job.isRemoteWork === true ? 'remote' : null;
  }
}

/** "Campinas, SP" — ou o país, quando não há cidade/estado. */
export function gupyLocation(job: Pick<GupyJob, 'city' | 'state' | 'country'>): string | null {
  const cityState = [job.city, job.state]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
  return cityState || job.country?.trim() || null;
}

/**
 * O `type` da Gupy diz contrato e, às vezes, nível. Casa por trecho, e não por
 * igualdade, para sobreviver a variações ("vacancy_type_effective",
 * "vacancy_legal_entity"...). Tipo desconhecido → contrato `null`, sem chute.
 */
export function gupyVacancyKind(
  type: string | null | undefined,
): 'talent-pool' | { contract: ContractType | null; seniority: SeniorityLevel | null } {
  const value = type?.toLowerCase() ?? '';

  if (!value) return { contract: null, seniority: null };
  if (/talent_pool|bank_of_talent/.test(value)) return 'talent-pool';
  if (/effective/.test(value)) return { contract: 'clt', seniority: null };
  if (/legal_entity/.test(value)) return { contract: 'pj', seniority: null };
  if (/internship/.test(value)) return { contract: 'internship', seniority: 'intern' };
  if (/temporary/.test(value)) return { contract: 'temporary', seniority: null };
  if (/apprentice/.test(value)) return { contract: 'other', seniority: 'intern' };
  if (/trainee/.test(value)) return { contract: 'other', seniority: 'trainee' };
  if (/^vacancy/.test(value)) return { contract: 'other', seniority: null };

  return { contract: null, seniority: null };
}

function toIsoDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
