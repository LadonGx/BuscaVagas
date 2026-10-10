import type { SalaryPeriod, SalaryRange, WorkModel } from '@busca-vagas/shared';
import { companyNameFromSlug, type BoardCompany } from '../core/boards/companies';
import type { BoardItem } from '../core/boards/filters';
import { companyDisplayName } from '../core/boards/per-company';
import type { PlaceEntry } from '../core/boards/place';
import { canonicalUrl } from '../core/canonical-url';
import { seniorityFromTitle } from '../core/normalize/seniority';
import { stackFromText } from '../core/normalize/stack';
import { fold, htmlToText } from '../core/normalize/text';
import { buildSalary, toIsoDate } from '../core/normalize/values';
import { contractFromText, workModelFromText } from '../core/normalize/work-model';
import { ashbyJobSchema, type AshbyAddress, type AshbyJob } from './ashby.schema';

export const ASHBY_SOURCE_ID = 'ashby';

const MAX_DESCRIPTION = 4_000;

/**
 * Vaga do Ashby → vaga padronizada + locais (para o filtro). `null` = fora
 * do formato, não listada, sem título ou com link inválido. O Ashby não
 * informa o nome da empresa: vem do `.env` ou do slug.
 */
export function mapAshbyJob(raw: unknown, company: BoardCompany): BoardItem | null {
  const parsed = ashbyJobSchema.safeParse(raw);
  if (!parsed.success) return null;

  const job = parsed.data;
  const title = job.title.trim();
  const url = canonicalUrl(job.jobUrl);
  if (!title || !url || job.isListed === false) return null;

  const location = job.location?.trim() || null;
  const description = job.descriptionHtml
    ? htmlToText(job.descriptionHtml, MAX_DESCRIPTION)
    : htmlToText(job.descriptionPlain ?? '', MAX_DESCRIPTION);
  const contractType = contractFromText(job.employmentType);
  const workModel =
    ashbyWorkModel(job.workplaceType) ??
    (job.isRemote === true ? 'remote' : workModelFromText(location));

  const entries: PlaceEntry[] = [{ text: location, country: addressCountry(job.address) }];
  for (const secondary of job.secondaryLocations ?? []) {
    entries.push({ text: secondary.location, country: addressCountry(secondary.address) });
  }

  return {
    posting: {
      source: ASHBY_SOURCE_ID,
      externalId: job.id ?? null,
      url,
      title,
      company: companyDisplayName(company, null, companyNameFromSlug),
      description: description || null,
      location,
      workModel,
      contractType,
      seniority: seniorityFromTitle(title) ?? (contractType === 'internship' ? 'intern' : null),
      stack: stackFromText(title, description),
      salary: ashbySalary(job),
      postedAt: toIsoDate(job.publishedAt),
    },
    place: { entries, remote: workModel === 'remote' },
  };
}

/* ------------------------------------------------------------- helpers */

export function ashbyWorkModel(value: string | null | undefined): WorkModel | null {
  switch (fold(value ?? '').replace(/[^a-z]/g, '')) {
    case 'remote':
      return 'remote';
    case 'hybrid':
      return 'hybrid';
    case 'onsite':
      return 'onsite';
    default:
      return null;
  }
}

export function ashbySalaryPeriod(value: string | null | undefined): SalaryPeriod | null {
  const interval = value?.toLowerCase() ?? '';
  if (interval.includes('year')) return 'year';
  if (interval.includes('month')) return 'month';
  if (interval.includes('hour')) return 'hour';
  return null;
}

/** Só o componente "Salary"; equity e bônus ficam de fora. */
function ashbySalary(job: AshbyJob): SalaryRange | null {
  const salary = job.compensation?.summaryComponents?.find(
    (component) => fold(component.compensationType ?? '') === 'salary',
  );
  if (!salary) return null;

  return buildSalary({
    min: salary.minValue,
    max: salary.maxValue,
    currency: salary.currencyCode,
    period: ashbySalaryPeriod(salary.interval),
  });
}

function addressCountry(address: AshbyAddress): string | null {
  return address?.postalAddress?.addressCountry ?? address?.addressCountry ?? null;
}
