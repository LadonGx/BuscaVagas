import { DEFAULT_TRIAGE_FILTER, type JobListQuery } from '@busca-vagas/shared';
import type { Prisma } from '../../generated/prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Filtros da listagem -> `where` do Prisma. Função pura: é aqui que um filtro
 * errado esconderia vagas, então é aqui que fica o teste.
 *
 * Cada filtro entra como um item do AND, para que dois filtros com OR
 * (busca por texto e idade da vaga) não se misturem.
 */
export function buildJobWhere(
  query: Omit<JobListQuery, 'limit' | 'cursor'>,
  now: Date = new Date(),
): Prisma.JobWhereInput {
  const and: Prisma.JobWhereInput[] = [
    // Descartadas ficam fora, a não ser que sejam pedidas.
    { triage: { in: query.triage ?? DEFAULT_TRIAGE_FILTER } },
  ];

  if (query.q) {
    and.push({
      OR: [
        { title: { contains: query.q, mode: 'insensitive' } },
        { company: { contains: query.q, mode: 'insensitive' } },
      ],
    });
  }

  if (query.workModel) and.push({ workModel: { in: query.workModel } });
  if (query.contractType) and.push({ contractType: { in: query.contractType } });
  if (query.seniority) and.push({ seniority: { in: query.seniority } });
  if (query.source) and.push({ source: { in: query.source } });
  if (query.stack) and.push({ stack: { hasSome: query.stack } });

  if (query.postedWithinDays) {
    const since = new Date(now.getTime() - query.postedWithinDays * DAY_MS);
    // Sem data de publicação, vale a data em que a vaga entrou no app.
    and.push({
      OR: [{ postedAt: { gte: since } }, { postedAt: null, firstSeenAt: { gte: since } }],
    });
  }

  if (query.minScore !== undefined) and.push({ score: { gte: query.minScore } });
  if (query.hideIncompatible) and.push({ incompatible: false });

  return { AND: and };
}
