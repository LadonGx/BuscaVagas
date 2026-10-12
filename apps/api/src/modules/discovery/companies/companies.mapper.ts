import type { CompanyCheckStatus, TrackedCompanyDto } from '@busca-vagas/shared';
import { boardPageUrl, companyNameFromSlug, isBoardSourceId } from '@busca-vagas/sources';
import type { TrackedCompany } from '../../../generated/prisma/client';

export function boardUrlOf(source: string, slug: string): string | null {
  return isBoardSourceId(source) ? boardPageUrl(source, slug) : null;
}

const STATUSES: readonly string[] = ['ok', 'not_found', 'failed'];

export function toTrackedCompanyDto(row: TrackedCompany): TrackedCompanyDto {
  return {
    id: row.id,
    source: row.source,
    slug: row.slug,
    name: row.name,
    displayName: row.name ?? companyNameFromSlug(row.slug),
    active: row.active,
    boardUrl: boardUrlOf(row.source, row.slug),
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    lastStatus:
      row.lastStatus && STATUSES.includes(row.lastStatus)
        ? (row.lastStatus as CompanyCheckStatus)
        : null,
    lastJobs: row.lastJobs,
    lastMatched: row.lastMatched,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
  };
}
