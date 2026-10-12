import type { BoardCompany, CompanyScanStat } from '@busca-vagas/sources';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/** Empresas do `.env` de uma fonte, para a importação inicial. */
export interface CompanySeed {
  sourceId: string;
  companies: readonly BoardCompany[];
}

/** Marca em `SystemFlag`: a importação do `.env` já rodou. */
export const ENV_IMPORT_FLAG = 'companies:env-imported';

/**
 * Acesso às empresas acompanhadas para quem busca (ScanRunner) e para a
 * lista de fontes. A edição pela tela fica no `CompaniesService`.
 */
@Injectable()
export class TrackedCompaniesStore {
  constructor(private readonly prisma: PrismaService) {}

  /** Empresas ligadas de um board, na ordem em que entraram. */
  async activeFor(sourceId: string): Promise<BoardCompany[]> {
    const rows = await this.prisma.trackedCompany.findMany({
      where: { source: sourceId, active: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { slug: true, name: true },
    });
    return rows.map((row) => ({ slug: row.slug, name: row.name }));
  }

  /** Quantas empresas ligadas por fonte (fonte sem nenhuma não aparece). */
  async activeCounts(): Promise<Map<string, number>> {
    const groups = await this.prisma.trackedCompany.groupBy({
      by: ['source'],
      where: { active: true },
      _count: { _all: true },
    });
    return new Map(groups.map((group) => [group.source, group._count._all]));
  }

  /** Guarda o resultado de cada empresa de uma leitura (busca ou conferência). */
  async recordScan(sourceId: string, stats: readonly CompanyScanStat[], at = new Date()) {
    for (const stat of stats) {
      await this.prisma.trackedCompany.updateMany({
        where: { source: sourceId, slug: { equals: stat.slug, mode: 'insensitive' } },
        data: {
          lastCheckedAt: at,
          lastStatus: stat.status,
          lastJobs: stat.jobs,
          lastMatched: stat.kept,
          lastError: stat.error,
        },
      });
    }
  }

  /**
   * Copia as empresas do `.env` para o banco UMA vez (a primeira subida
   * depois desta versão). Depois disso a tela manda: apagar uma empresa não
   * a traz de volta na próxima subida. Devolve quantas entraram, ou `null`
   * se já tinha rodado.
   */
  async importSeedsOnce(seeds: readonly CompanySeed[]): Promise<number | null> {
    return this.prisma.$transaction(async (tx) => {
      const done = await tx.systemFlag.findUnique({ where: { key: ENV_IMPORT_FLAG } });
      if (done) return null;

      const data = seeds.flatMap((seed) =>
        seed.companies.map((company) => ({
          source: seed.sourceId,
          slug: company.slug,
          name: company.name,
        })),
      );
      const { count } = data.length
        ? await tx.trackedCompany.createMany({ data, skipDuplicates: true })
        : { count: 0 };
      await tx.systemFlag.create({ data: { key: ENV_IMPORT_FLAG } });
      return count;
    });
  }
}
