import { companyNameFromSlug, type BoardCompany } from '../core/boards/companies';
import type { BoardItem } from '../core/boards/filters';
import { companyDisplayName } from '../core/boards/per-company';
import type { PlaceEntry } from '../core/boards/place';
import { canonicalUrl } from '../core/canonical-url';
import { seniorityFromTitle } from '../core/normalize/seniority';
import { stackFromText } from '../core/normalize/stack';
import { decodeEntities, htmlToText } from '../core/normalize/text';
import { toIsoDate } from '../core/normalize/values';
import { workModelFromText } from '../core/normalize/work-model';
import { greenhouseJobSchema } from './greenhouse.schema';

export const GREENHOUSE_SOURCE_ID = 'greenhouse';

const MAX_DESCRIPTION = 4_000;

/**
 * Vaga do Greenhouse → vaga padronizada + locais (para o filtro). `null` =
 * fora do formato, sem título ou com link inválido.
 *
 * O Greenhouse não informa contrato nem modalidade em campo próprio: a
 * modalidade sai do texto do local ("Remote", "Híbrido"); o contrato fica `null`.
 */
export function mapGreenhouseJob(raw: unknown, company: BoardCompany): BoardItem | null {
  const parsed = greenhouseJobSchema.safeParse(raw);
  if (!parsed.success) return null;

  const job = parsed.data;
  const title = job.title.trim();
  const url = canonicalUrl(job.absolute_url);
  if (!title || !url) return null;

  const location = job.location?.name?.trim() || null;
  // `content` vem escapado: decodifica uma vez para virar HTML, e o htmlToText faz o resto.
  const description = job.content ? htmlToText(decodeEntities(job.content), MAX_DESCRIPTION) : null;

  const entries: PlaceEntry[] = [{ text: location }];
  for (const office of job.offices ?? []) {
    entries.push({ text: [office.name, office.location].filter(Boolean).join(', ') });
  }

  return {
    posting: {
      source: GREENHOUSE_SOURCE_ID,
      externalId: String(job.id),
      url,
      title,
      company: companyDisplayName(company, job.company_name, companyNameFromSlug),
      description: description || null,
      location,
      workModel: workModelFromText(location),
      contractType: null,
      seniority: seniorityFromTitle(title),
      stack: stackFromText(title, description),
      salary: null,
      postedAt: toIsoDate(job.first_published),
    },
    place: { entries },
  };
}
