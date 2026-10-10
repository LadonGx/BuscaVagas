import type { SalaryPeriod, WorkModel } from '@busca-vagas/shared';
import { companyNameFromSlug, type BoardCompany } from '../core/boards/companies';
import type { BoardItem } from '../core/boards/filters';
import { companyDisplayName } from '../core/boards/per-company';
import { canonicalUrl } from '../core/canonical-url';
import { seniorityFromTitle } from '../core/normalize/seniority';
import { stackFromText } from '../core/normalize/stack';
import { htmlToText } from '../core/normalize/text';
import { buildSalary, toIsoDate } from '../core/normalize/values';
import { contractFromText, workModelFromText } from '../core/normalize/work-model';
import { leverPostingSchema, type LeverPosting } from './lever.schema';

export const LEVER_SOURCE_ID = 'lever';

const MAX_DESCRIPTION = 4_000;

/**
 * Vaga do Lever → vaga padronizada + locais (para o filtro). `null` = fora
 * do formato, sem título ou com link inválido. O Lever não informa o nome
 * da empresa: vem do `.env` ou do slug.
 */
export function mapLeverPosting(raw: unknown, company: BoardCompany): BoardItem | null {
  const parsed = leverPostingSchema.safeParse(raw);
  if (!parsed.success) return null;

  const job = parsed.data;
  const title = job.text.trim();
  const url = canonicalUrl(job.hostedUrl);
  if (!title || !url) return null;

  const location = job.categories?.location?.trim() || null;
  const locations = job.categories?.allLocations?.length ? job.categories.allLocations : [location];
  const description = leverDescription(job);
  const contractType = contractFromText(job.categories?.commitment);
  const workModel = leverWorkModel(job.workplaceType) ?? workModelFromText(location);

  return {
    posting: {
      source: LEVER_SOURCE_ID,
      externalId: job.id ?? null,
      url,
      title,
      company: companyDisplayName(company, null, companyNameFromSlug),
      description,
      location,
      workModel,
      contractType,
      seniority: seniorityFromTitle(title) ?? (contractType === 'internship' ? 'intern' : null),
      stack: stackFromText(title, description),
      salary: buildSalary({
        min: job.salaryRange?.min,
        max: job.salaryRange?.max,
        currency: job.salaryRange?.currency,
        period: leverSalaryPeriod(job.salaryRange?.interval),
      }),
      postedAt: toIsoDate(job.createdAt),
    },
    place: {
      entries: locations.map((text) => ({ text, country: job.country })),
      remote: workModel === 'remote',
    },
  };
}

/* ------------------------------------------------------------- helpers */

export function leverWorkModel(value: string | null | undefined): WorkModel | null {
  switch (value?.trim().toLowerCase()) {
    case 'remote':
      return 'remote';
    case 'hybrid':
      return 'hybrid';
    case 'on-site':
    case 'onsite':
      return 'onsite';
    default:
      // "unspecified" ou ausente: o texto do local é a segunda pista.
      return null;
  }
}

export function leverSalaryPeriod(value: string | null | undefined): SalaryPeriod | null {
  const interval = value?.toLowerCase() ?? '';
  if (interval.includes('year')) return 'year';
  if (interval.includes('month')) return 'month';
  if (interval.includes('hour')) return 'hour';
  // semana, dia, valor único: não há período equivalente.
  return null;
}

/** Descrição + listas (requisitos, benefícios...) + texto adicional. */
function leverDescription(job: LeverPosting): string | null {
  const html = [
    job.description ?? '',
    ...(job.lists ?? []).map((list) => `<h3>${list.text ?? ''}</h3><ul>${list.content ?? ''}</ul>`),
    job.additional ?? '',
  ].join('');

  const text = html.trim()
    ? htmlToText(html, MAX_DESCRIPTION)
    : htmlToText(job.descriptionPlain ?? '', MAX_DESCRIPTION);
  return text || null;
}
