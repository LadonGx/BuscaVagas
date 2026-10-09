import type { JobDto } from '@busca-vagas/shared';
import type { Prisma } from '../../generated/prisma/client';

/** O que toda consulta de vaga traz junto, para montar o `JobDto`. */
export const jobInclude = {
  application: { select: { id: true, status: true } },
} satisfies Prisma.JobInclude;

/** Linha do banco -> DTO público. Explícito para não vazar campo interno. */
export function toJobDto(job: Prisma.JobGetPayload<{ include: typeof jobInclude }>): JobDto {
  return {
    id: job.id,
    source: job.source,
    externalId: job.externalId,
    url: job.url,
    title: job.title,
    company: job.company,
    description: job.description,
    location: job.location,
    notes: job.notes,
    workModel: job.workModel,
    contractType: job.contractType,
    seniority: job.seniority,
    stack: job.stack,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    salaryPeriod: job.salaryPeriod,
    postedAt: job.postedAt?.toISOString() ?? null,
    firstSeenAt: job.firstSeenAt.toISOString(),
    lastSeenAt: job.lastSeenAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    triage: job.triage,
    triagedAt: job.triagedAt?.toISOString() ?? null,
    dismissReason: job.dismissReason,
    application: job.application,
  };
}
