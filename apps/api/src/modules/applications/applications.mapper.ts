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
  resumeSnapshot: { select: { id: true, hash: true } },
  // Só os dados do PDF, nunca o conteúdo.
  resumeFile: { select: { name: true, size: true, createdAt: true } },
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

/** `currentHash`: hash do currículo de hoje, para dizer se a cópia ainda é igual. */
export function toApplicationDetailDto(
  row: ApplicationDetailRow,
  currentHash: string | null,
): ApplicationDetailDto {
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
    resume:
      row.resumeSnapshot && row.resumeSavedAt
        ? {
            snapshotId: row.resumeSnapshot.id,
            savedAt: row.resumeSavedAt.toISOString(),
            sameAsCurrent: row.resumeSnapshot.hash === currentHash,
          }
        : null,
    resumeFile: row.resumeFile
      ? {
          name: row.resumeFile.name,
          size: row.resumeFile.size,
          uploadedAt: row.resumeFile.createdAt.toISOString(),
        }
      : null,
  };
}
