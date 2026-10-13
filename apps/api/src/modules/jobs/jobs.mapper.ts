import type {
  AvailabilityState,
  JobAvailabilityDto,
  JobDto,
  ScoreReason,
} from '@busca-vagas/shared';
import type { Prisma } from '../../generated/prisma/client';

/** O que toda consulta de vaga traz junto, para montar o `JobDto`. */
export const jobInclude = {
  application: { select: { id: true, status: true } },
  repostOf: {
    select: {
      id: true,
      triage: true,
      triagedAt: true,
      application: { select: { id: true, status: true } },
    },
  },
  aliases: { select: { source: true, url: true }, orderBy: { firstSeenAt: 'asc' } },
} satisfies Prisma.JobInclude;

/**
 * A nota está na fila: a vaga nunca foi pontuada (nova ou editada) ou foi
 * pontuada com uma versão antiga das preferências. Mesma regra das contagens.
 */
export function isScorePending(scoredVersion: number | null, scoreVersion: number): boolean {
  return scoredVersion === null || scoredVersion < scoreVersion;
}

/**
 * Linha do banco -> DTO público. Explícito para não vazar campo interno.
 * `scoreVersion` = versão atual das preferências (`loadScoreVersion`).
 */
export function toJobDto(
  job: Prisma.JobGetPayload<{ include: typeof jobInclude }>,
  scoreVersion: number,
): JobDto {
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
    score: job.score,
    scoreCoverage: job.scoreCoverage,
    scoreReasons: Array.isArray(job.scoreReasons)
      ? (job.scoreReasons as unknown as ScoreReason[])
      : [],
    incompatible: job.incompatible,
    scorePending: isScorePending(job.scoredVersion, scoreVersion),
    repost:
      job.repostCount > 0
        ? {
            count: job.repostCount,
            previousSeenAt: job.previousSeenAt?.toISOString() ?? null,
            previous: job.repostOf
              ? {
                  id: job.repostOf.id,
                  triage: job.repostOf.triage,
                  triagedAt: job.repostOf.triagedAt?.toISOString() ?? null,
                  application: job.repostOf.application,
                }
              : null,
          }
        : null,
    alsoOn: job.aliases,
    availability: availabilityOf(job),
  };
}

const STATES: readonly string[] = ['open', 'closed', 'unknown'];
const dateBr = (date: Date) => date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });

/**
 * Encerrada = soubemos que fechou (`closedAt`) ou o prazo de inscrição venceu.
 * Senão, o resultado da última conferência (ou `null`, nunca conferida).
 * Plano: docs/features/13-availability.md
 */
export function availabilityOf(
  job: Pick<
    Prisma.JobGetPayload<object>,
    'closedAt' | 'closedReason' | 'checkedAt' | 'checkState' | 'checkReason' | 'deadline'
  >,
  now: Date = new Date(),
): JobAvailabilityDto {
  const expired = job.deadline !== null && job.deadline < now;
  const checked =
    job.checkState && STATES.includes(job.checkState)
      ? (job.checkState as AvailabilityState)
      : null;
  const closed = job.closedAt !== null || expired;
  return {
    state: closed ? 'closed' : checked,
    reason: job.closedAt
      ? job.closedReason
      : expired
        ? `O prazo de inscrição terminou em ${dateBr(job.deadline!)}`
        : job.checkReason,
    closedAt: (job.closedAt ?? (expired ? job.deadline : null))?.toISOString() ?? null,
    checkedAt: job.checkedAt?.toISOString() ?? null,
    deadline: job.deadline?.toISOString() ?? null,
  };
}
