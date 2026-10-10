import {
  isPreferencesConfigured,
  MANUAL_SOURCE,
  normalizeStack,
  type BulkTriageInput,
  type BulkTriageResult,
  type CreateJobInput,
  type IngestResult,
  type JobDto,
  type JobListQuery,
  type JobPosting,
  type Page,
  type TriageInput,
  type UpdateJobInput,
} from '@busca-vagas/shared';
import { canonicalUrl } from '@busca-vagas/sources';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  afterCursor,
  afterScoreCursor,
  decodeCursor,
  decodeScoreCursor,
  encodeScoreCursor,
  toPage,
} from '../../common/pagination/cursor';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { loadPreferences } from '../preferences/preferences.store';
import { SCORE_REQUESTER, type ScoreRequester } from '../scoring/scoring.constants';
import { jobInclude, toJobDto } from './jobs.mapper';
import { buildJobWhere } from './jobs.where';

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    /**
     * Pede o cálculo da nota em segundo plano (fila `scoring`). Opcional:
     * sem ele (testes sem Redis), a vaga só fica com a nota pendente.
     */
    @Optional() @Inject(SCORE_REQUESTER) private readonly scoring?: ScoreRequester,
  ) {}

  async create(input: CreateJobInput): Promise<JobDto> {
    const url = this.canonicalOrNull(input.url);

    if (url) {
      await this.assertUrlFree(url);
    }

    const job = await this.prisma.job.create({
      data: { ...input, url, source: MANUAL_SOURCE, externalId: null },
      include: jobInclude,
    });

    this.requestScoring('job:create');
    return toJobDto(job);
  }

  /**
   * Listagem paginada por cursor. Ordem padrão: pela nota quando há
   * preferências (vagas sem nota no fim), senão pela data de entrada.
   */
  async list(query: JobListQuery): Promise<Page<JobDto>> {
    const where: Prisma.JobWhereInput = buildJobWhere(query);
    const and = (where.AND as Prisma.JobWhereInput[] | undefined) ?? [];
    const sort = query.sort ?? ((await this.hasPreferences()) ? 'score' : 'recent');

    if (sort === 'score') {
      if (query.cursor) {
        where.AND = [
          ...and,
          afterScoreCursor(decodeScoreCursor(query.cursor)) as Prisma.JobWhereInput,
        ];
      }

      const rows = await this.prisma.job.findMany({
        where,
        orderBy: [{ score: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
        take: query.limit + 1,
        include: jobInclude,
      });

      const hasMore = rows.length > query.limit;
      const page = hasMore ? rows.slice(0, query.limit) : rows;
      const last = page.at(-1);
      return {
        items: page.map(toJobDto),
        nextCursor: hasMore && last ? encodeScoreCursor({ s: last.score, id: last.id }) : null,
      };
    }

    if (query.cursor) {
      where.AND = [
        ...and,
        afterCursor('firstSeenAt', decodeCursor(query.cursor)) as Prisma.JobWhereInput,
      ];
    }

    const rows = await this.prisma.job.findMany({
      where,
      orderBy: [{ firstSeenAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: jobInclude,
    });

    return toPage(rows, query.limit, (row) => row.firstSeenAt, toJobDto);
  }

  async get(id: string): Promise<JobDto> {
    return toJobDto(await this.findOrThrow(id));
  }

  async update(id: string, input: UpdateJobInput): Promise<JobDto> {
    const current = await this.findOrThrow(id);
    // Editou a vaga: a nota volta a ficar pendente e é recalculada em segundo plano.
    const data: Prisma.JobUpdateInput = { ...input, scoredVersion: null };

    if (input.url !== undefined) {
      const url = this.canonicalOrNull(input.url);
      if (url && url !== current.url) {
        await this.assertUrlFree(url);
      }
      data.url = url;
    }

    // A faixa salarial é validada contra o valor que vai ficar no banco, não
    // só contra o que veio no PATCH.
    const salaryMin = input.salaryMin !== undefined ? input.salaryMin : current.salaryMin;
    const salaryMax = input.salaryMax !== undefined ? input.salaryMax : current.salaryMax;
    if (salaryMin != null && salaryMax != null && salaryMin > salaryMax) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Dados inválidos',
        issues: [
          { path: 'salaryMax', message: 'O salário máximo não pode ser menor que o mínimo' },
        ],
      });
    }

    const job = await this.prisma.job.update({ where: { id }, data, include: jobInclude });
    this.requestScoring('job:update');
    return toJobDto(job);
  }

  async remove(id: string): Promise<void> {
    const job = await this.findOrThrow(id);

    if (job.application) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Esta vaga tem uma candidatura. Apague a candidatura antes de apagar a vaga.',
        applicationId: job.application.id,
      });
    }

    await this.prisma.job.delete({ where: { id } });
  }

  /* ------------------------------------------------------------ triagem */

  /** Plano: docs/features/02-triage.md */
  async setTriage(id: string, input: TriageInput): Promise<JobDto> {
    const current = await this.findOrThrow(id);

    if (input.status === 'dismissed' && current.application) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Esta vaga tem uma candidatura e não pode ser descartada.',
        applicationId: current.application.id,
      });
    }

    const job = await this.prisma.job.update({
      where: { id },
      data: triageData(input),
      include: jobInclude,
    });
    return toJobDto(job);
  }

  async bulkTriage(input: BulkTriageInput): Promise<BulkTriageResult> {
    const ids = [...new Set(input.ids)];
    const found = await this.prisma.job.findMany({
      where: {
        id: { in: ids },
        // Vaga com candidatura não pode ser descartada: fica em `skipped`.
        ...(input.status === 'dismissed' ? { application: { is: null } } : {}),
      },
      select: { id: true },
    });
    const eligible = new Set(found.map((job) => job.id));

    const { count } = await this.prisma.job.updateMany({
      where: { id: { in: [...eligible] } },
      data: triageData(input),
    });

    return { updated: count, skipped: ids.filter((id) => !eligible.has(id)) };
  }

  /* ------------------------------------------------------------- fontes */

  /**
   * Porta de entrada das fontes. Grava as vagas novas e marca como vistas as
   * que já existiam — sem sobrescrever nada delas (você pode ter editado).
   */
  async ingest(postings: readonly JobPosting[]): Promise<IngestResult> {
    const now = new Date();
    const byUrl = new Map<string, Prisma.JobCreateManyInput>();

    for (const posting of postings) {
      const url = canonicalUrl(posting.url);
      if (!url || byUrl.has(url)) {
        continue;
      }

      byUrl.set(url, {
        source: posting.source,
        externalId: posting.externalId,
        url,
        title: posting.title,
        company: posting.company,
        description: posting.description,
        location: posting.location,
        workModel: posting.workModel,
        contractType: posting.contractType,
        seniority: posting.seniority,
        stack: normalizeStack(posting.stack),
        salaryMin: posting.salary?.min ?? null,
        salaryMax: posting.salary?.max ?? null,
        salaryCurrency: posting.salary?.currency ?? null,
        salaryPeriod: posting.salary?.period ?? null,
        postedAt: posting.postedAt ? new Date(posting.postedAt) : null,
        firstSeenAt: now,
        lastSeenAt: now,
      });
    }

    // Descartadas que a retenção já apagou: a fonte trouxe de novo, mas você
    // já disse não. Ver docs/features/08-retention.md.
    let ignored = 0;
    if (byUrl.size > 0) {
      const forgotten = await this.prisma.forgottenJob.findMany({
        where: { url: { in: [...byUrl.keys()] } },
        select: { url: true },
      });
      for (const { url } of forgotten) {
        byUrl.delete(url);
        ignored += 1;
      }
    }

    if (byUrl.size === 0) {
      return { received: postings.length, created: 0, seen: 0, ignored };
    }

    // skipDuplicates: a deduplicação é do banco (URL e source+externalId
    // únicos). Dois jobs da fila gravando ao mesmo tempo não duplicam nada.
    const { count: created } = await this.prisma.job.createMany({
      data: [...byUrl.values()],
      skipDuplicates: true,
    });

    // As recém-criadas têm firstSeenAt = now e ficam de fora.
    const { count: seen } = await this.prisma.job.updateMany({
      where: { url: { in: [...byUrl.keys()] }, firstSeenAt: { lt: now } },
      data: { lastSeenAt: now },
    });

    // As novas entram sem nota; a fila calcula depois, sem atrasar a gravação.
    if (created > 0) {
      this.requestScoring('ingest');
    }

    return { received: postings.length, created, seen, ignored };
  }

  /* ----------------------------------------------------------- internos */

  /** Sem esperar: a nota é trabalho de fundo e nunca segura a resposta. */
  private requestScoring(reason: string): void {
    void this.scoring?.request(reason);
  }

  private async hasPreferences(): Promise<boolean> {
    const { values } = await loadPreferences(this.prisma);
    return isPreferencesConfigured(values);
  }

  private async findOrThrow(id: string) {
    const job = await this.prisma.job.findUnique({ where: { id }, include: jobInclude });

    if (!job) {
      throw new NotFoundException({ statusCode: 404, message: 'Vaga não encontrada.' });
    }

    return job;
  }

  private canonicalOrNull(url: string | null | undefined): string | null {
    return url ? canonicalUrl(url) : null;
  }

  private async assertUrlFree(url: string): Promise<void> {
    const existing = await this.prisma.job.findUnique({ where: { url }, select: { id: true } });

    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Esta vaga já está cadastrada.',
        existingJobId: existing.id,
      });
    }
  }
}

/**
 * Campos de triagem a gravar. Voltar para `inbox` limpa a data e o motivo; o
 * motivo só é guardado para `dismissed`.
 */
export function triageData(input: TriageInput, now: Date = new Date()) {
  if (input.status === 'inbox') {
    return { triage: input.status, triagedAt: null, dismissReason: null };
  }

  return {
    triage: input.status,
    triagedAt: now,
    dismissReason: input.status === 'dismissed' ? (input.reason ?? null) : null,
  };
}
