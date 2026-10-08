import type { JobPosting } from '@busca-vagas/shared';
import { canonicalUrl } from '../core/canonical-url';
import { templateJobSchema } from './template.schema';

export const TEMPLATE_SOURCE_ID = 'template';

const MAX_DESCRIPTION = 4_000;

/**
 * Item cru do site -> JobPosting. Devolve `null` quando o item não serve
 * (formato inválido, URL inválida...) — `parseEach` conta como descartado.
 */
export function mapTemplateJob(raw: unknown): JobPosting | null {
  const parsed = templateJobSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }

  const job = parsed.data;
  const url = canonicalUrl(job.url);
  if (!url) {
    return null;
  }

  return {
    source: TEMPLATE_SOURCE_ID,
    externalId: String(job.id),
    url,
    title: job.title.trim(),
    company: job.company.trim(),
    description: job.description?.slice(0, MAX_DESCRIPTION) ?? null,
    location: job.city ?? null,
    workModel: job.remote ? 'remote' : null,
    contractType: null,
    seniority: null,
    stack: [],
    salary: null,
    postedAt: toIsoDate(job.published_at),
  };
}

function toIsoDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
