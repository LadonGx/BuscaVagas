import {
  withPreviousStatus,
  type ApplicationDetailDto,
  type ApplicationDto,
} from '@busca-vagas/shared';
import type { Prisma } from '../../generated/prisma/client';

export const applicationInclude = {
  job: {
    select: { id: true, title: true, company: true, url: true, location: true, workModel: true },
  },
} satisfies Prisma.ApplicationInclude;

export const applicationDetailInclude = {
  ...applicationInclude,
  events: true,
} satisfies Prisma.ApplicationInclude;

type ApplicationRow = Prisma.ApplicationGetPayload<{ include: typeof applicationInclude }>;
type ApplicationDetailRow = Prisma.ApplicationGetPayload<{
  include: typeof applicationDetailInclude;
}>;

export function toApplicationDto(row: ApplicationRow): ApplicationDto {
  return {
    id: row.id,
    jobId: row.jobId,
    status: row.status,
    appliedAt: row.appliedAt.toISOString(),
    appliedVia: row.appliedVia,
    salaryExpectation: row.salaryExpectation,
    notes: row.notes,
    nextStepAt: row.nextStepAt?.toISOString() ?? null,
    nextStepNote: row.nextStepNote,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    job: row.job,
  };
}

export function toApplicationDetailDto(row: ApplicationDetailRow): ApplicationDetailDto {
  return {
    ...toApplicationDto(row),
    events: withPreviousStatus(row.events).map((event) => ({
      id: event.id,
      status: event.status,
      previousStatus: event.previousStatus,
      occurredAt: event.occurredAt.toISOString(),
      note: event.note,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}
