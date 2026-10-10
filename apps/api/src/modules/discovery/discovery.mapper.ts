import type { ScanTrigger, SourceRunDto } from '@busca-vagas/shared';
import type { SourceRun } from '../../generated/prisma/client';

export function toSourceRunDto(run: SourceRun): SourceRunDto {
  return {
    id: run.id,
    sourceId: run.sourceId,
    status: run.status,
    trigger: run.trigger === 'schedule' ? 'schedule' : ('manual' satisfies ScanTrigger),
    terms: run.terms,
    jobsFound: run.jobsFound,
    jobsNew: run.jobsNew,
    dropped: run.dropped,
    durationMs: run.durationMs,
    error: run.error,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
  };
}
