import {
  DUPLICATE_LIVE_DAYS,
  isPreferencesConfigured,
  MANUAL_SOURCE,
  MUTED_REPOST_REASON,
  REPOST_WINDOW_DAYS,
  normalizeStack,
  SCORE_TIER_MIN,
  type BulkTriageInput,
  type BulkTriageResult,
  type CreateJobInput,
  type IngestResult,
  type JobCountsDto,
  type JobDto,
  type JobHistoryDto,
  type JobOccurrenceDto,
  type JobListQuery,
  type JobPosting,
  type MuteRepostsInput,
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
import {
  loadPreferences,
  loadScoreVersion,
  PREFERENCES_ID,
} from '../preferences/preferences.store';
import { SCORE_REQUESTER, type ScoreRequester } from '../scoring/scoring.constants';
import { jobFingerprint } from './fingerprint';
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
      data: {
        ...input,
        url,
        source: MANUAL_SOURCE,
        externalId: null,
        fingerprint: jobFingerprint({
          title: input.title,
          company: input.company,
          location: input.location ?? null,
          workModel: input.workModel ?? null,
        }),
      },
      include: jobInclude,
    });

    this.requestScoring('job:create');
    return toJobDto(job, await this.scoreVersion());
  }

  /**
   * Listagem paginada por cursor. Ordem padrão: pela nota quando há
   * preferências (vagas sem nota no fim), senão pela data de entrada.
   */
  async list(query: JobListQuery): Promise<Page<JobDto>> {
    const where: Prisma.JobWhereInput = buildJobWhere(query);
    const and = (where.AND as Prisma.JobWhereInput[] | undefined) ?? [];
    const sort = query.sort ?? ((await this.hasPreferences()) ? 'score' : 'recent');
    const version = await this.scoreVersion();
    const toDto = (row: Parameters<typeof toJobDto>[0]) => toJobDto(row, version);

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
        items: page.map(toDto),
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

    return toPage(rows, query.limit, (row) => row.firstSeenAt, toDto);
  }

  /**
   * Contagens numa consulta só (`count FILTER`). As faixas seguem a mesma
   * ordem de `scoreTier`: pendente > incompatível > sem nota > faixa.
   * Pendente = nunca pontuada ou pontuada com preferências antigas (a mesma
   * regra do `scorePending` de cada vaga, em `isScorePending`).
   */
  async counts(): Promise<JobCountsDto> {
    const { great, good } = SCORE_TIER_MIN;
    const [row] = await this.prisma.$queryRaw<Record<string, bigint>[]>`
      WITH prefs AS (
        SELECT COALESCE((SELECT version FROM "Preferences" WHERE id = ${PREFERENCES_ID}), 0) AS version
      ),
      visible AS (
        SELECT j.*,
          (j."scoredVersion" IS NULL OR j."scoredVersion" < prefs.version) AS pending
        FROM "Job" j, prefs WHERE j.triage IN ('inbox', 'saved')
      )
      SELECT
        (SELECT count(*) FROM "Job" WHERE triage = 'inbox') AS inbox,
        (SELECT count(*) FROM "Job" WHERE triage = 'saved') AS saved,
        (SELECT count(*) FROM "Job" WHERE triage = 'dismissed') AS dismissed,
        (SELECT count(*) FROM "Application") AS "withApplication",
        (SELECT count(*) FROM "Job" WHERE triage = 'inbox' AND NOT incompatible
          AND "closedAt" IS NULL AND ("deadline" IS NULL OR "deadline" >= now())) AS swipeable,
        (SELECT count(*) FROM "Job" WHERE triage = 'inbox'
          AND ("closedAt" IS NOT NULL OR "deadline" < now())) AS "inboxClosed",
        count(*) FILTER (WHERE pending) AS pending,
        count(*) FILTER (WHERE NOT pending AND incompatible) AS incompatible,
        count(*) FILTER (WHERE NOT pending AND NOT incompatible AND score IS NULL) AS unscored,
        count(*) FILTER (WHERE NOT pending AND NOT incompatible AND score >= ${great}) AS great,
        count(*) FILTER (WHERE NOT pending AND NOT incompatible AND score >= ${good} AND score < ${great}) AS good,
        count(*) FILTER (WHERE NOT pending AND NOT incompatible AND score < ${good}) AS weak
      FROM visible
    `;
    const n = (key: string) => Number(row?.[key] ?? 0);

    return {
      triage: { inbox: n('inbox'), saved: n('saved'), dismissed: n('dismissed') },
      withApplication: n('withApplication'),
      score: {
        great: n('great'),
        good: n('good'),
        weak: n('weak'),
        incompatible: n('incompatible'),
        pending: n('pending'),
        unscored: n('unscored'),
      },
      swipeable: n('swipeable'),
      inboxClosed: n('inboxClosed'),
    };
  }

  async get(id: string): Promise<JobDto> {
    return toJobDto(await this.findOrThrow(id), await this.scoreVersion());
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

    // Mudou o que forma a impressão: recalcula (as ligações antigas ficam).
    data.fingerprint = jobFingerprint({
      title: input.title ?? current.title,
      company: input.company ?? current.company,
      location: input.location !== undefined ? input.location : current.location,
      workModel: input.workModel !== undefined ? input.workModel : current.workModel,
    });

    const job = await this.prisma.job.update({ where: { id }, data, include: jobInclude });
    this.requestScoring('job:update');
    return toJobDto(job, await this.scoreVersion());
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
    return toJobDto(job, await this.scoreVersion());
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
   *
   * Link novo com a mesma impressão de uma vaga que já passou pelo app
   * (docs/features/11-reposts.md):
   *  - a anterior foi vista há menos de DUPLICATE_LIVE_DAYS → é a MESMA vaga
   *    em outro link: vira `JobAlias` da anterior, não outra vaga;
   *  - senão → repostagem: vaga nova, ligada à anterior e com a contagem.
   *    Se você silenciou essa impressão, ela já entra descartada.
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
        fingerprint: jobFingerprint(posting),
        deadline: posting.deadline ? new Date(posting.deadline) : null,
        board: posting.board ?? null,
      });
    }

    const result: IngestResult = {
      received: postings.length,
      created: 0,
      seen: 0,
      ignored: 0,
      duplicates: 0,
      reposts: 0,
    };
    if (byUrl.size === 0) return result;

    // Descartadas que a retenção já apagou: a fonte trouxe de novo, mas você
    // já disse não. Ver docs/features/08-retention.md.
    const urls = [...byUrl.keys()];
    const [forgottenUrls, knownJobs, knownAliases] = await Promise.all([
      this.prisma.forgottenJob.findMany({ where: { url: { in: urls } }, select: { url: true } }),
      this.prisma.job.findMany({ where: { url: { in: urls } }, select: { url: true } }),
      this.prisma.jobAlias.findMany({
        where: { url: { in: urls } },
        select: { url: true, jobId: true },
      }),
    ]);
    for (const { url } of forgottenUrls) {
      byUrl.delete(url);
      result.ignored += 1;
    }

    // 1. Links que já conhecemos: só "visto" — e, se estava encerrada, a
    //    fonte trazer de novo reabre. Nada do que você editou é sobrescrito.
    const known = knownJobs.map((job) => job.url!).filter((url) => byUrl.has(url));
    if (known.length > 0) {
      const { count } = await this.prisma.job.updateMany({
        where: { url: { in: known }, firstSeenAt: { lt: now } },
        data: { lastSeenAt: now, closedAt: null, closedReason: null },
      });
      result.seen += count;
      // Vagas de antes do campo `board`: ganham o slug na primeira vez que voltam.
      const byBoard = new Map<string, string[]>();
      for (const url of known) {
        const board = byUrl.get(url)?.board;
        if (board) byBoard.set(board, [...(byBoard.get(board) ?? []), url]);
      }
      for (const [board, urls] of byBoard) {
        await this.prisma.job.updateMany({
          where: { url: { in: urls }, board: null },
          data: { board },
        });
      }
    }
    const aliasHits = knownAliases.filter((alias) => byUrl.has(alias.url));
    if (aliasHits.length > 0) {
      await this.prisma.jobAlias.updateMany({
        where: { url: { in: aliasHits.map((alias) => alias.url) } },
        data: { lastSeenAt: now },
      });
      await this.touch(
        aliasHits.map((alias) => alias.jobId),
        now,
      );
      result.seen += aliasHits.length;
    }
    for (const url of [...known, ...aliasHits.map((alias) => alias.url)]) byUrl.delete(url);
    if (byUrl.size === 0) return result;

    // 2. Links novos: a impressão já apareceu?
    const fresh = [...byUrl.values()];
    const fingerprints = [...new Set(fresh.map((job) => job.fingerprint).filter(isString))];
    const since = new Date(now.getTime() - REPOST_WINDOW_DAYS * DAY_MS);
    const liveSince = new Date(now.getTime() - DUPLICATE_LIVE_DAYS * DAY_MS);
    const [earlier, forgotten, muted] = fingerprints.length
      ? await Promise.all([
          this.prisma.job.findMany({
            where: { fingerprint: { in: fingerprints }, lastSeenAt: { gte: since } },
            select: { id: true, fingerprint: true, lastSeenAt: true },
            orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }],
          }),
          this.prisma.forgottenJob.findMany({
            where: { fingerprint: { in: fingerprints }, forgottenAt: { gte: since } },
            select: { fingerprint: true, forgottenAt: true },
          }),
          this.prisma.mutedRepost.findMany({
            where: { fingerprint: { in: fingerprints } },
            select: { fingerprint: true },
          }),
        ])
      : [[], [], []];

    const earlierBy = groupBy(earlier, (job) => job.fingerprint!);
    const forgottenBy = groupBy(forgotten, (item) => item.fingerprint!);
    const mutedSet = new Set(muted.map((item) => item.fingerprint));

    const toCreate: Prisma.JobCreateManyInput[] = [];
    const aliases: Prisma.JobAliasCreateManyInput[] = [];
    /** Mesma impressão duas vezes nesta leva: a 2ª vira link da 1ª (depois de criada). */
    const firstInBatch = new Map<string, string>();
    const batchAliases: {
      ownerUrl: string;
      alias: Omit<Prisma.JobAliasCreateManyInput, 'jobId'>;
    }[] = [];

    for (const job of fresh) {
      const fingerprint = job.fingerprint;
      const alias = {
        url: job.url!,
        source: job.source,
        externalId: job.externalId ?? null,
        firstSeenAt: now,
        lastSeenAt: now,
      };

      if (fingerprint) {
        const ownerUrl = firstInBatch.get(fingerprint);
        if (ownerUrl) {
          batchAliases.push({ ownerUrl, alias });
          continue;
        }

        const previous = earlierBy.get(fingerprint) ?? [];
        const latest = previous[0];
        if (latest && latest.lastSeenAt >= liveSince) {
          aliases.push({ ...alias, jobId: latest.id });
          continue;
        }

        const gone = forgottenBy.get(fingerprint) ?? [];
        const count = previous.length + gone.length;
        if (count > 0) {
          const seenTimes = [
            ...previous.map((item) => item.lastSeenAt.getTime()),
            ...gone.map((item) => item.forgottenAt.getTime()),
          ];
          Object.assign(job, {
            repostOfId: latest?.id ?? null,
            repostCount: count,
            previousSeenAt: new Date(Math.max(...seenTimes)),
            ...(mutedSet.has(fingerprint) && {
              triage: 'dismissed',
              triagedAt: now,
              dismissReason: MUTED_REPOST_REASON,
            }),
          } satisfies Partial<Prisma.JobCreateManyInput>);
          result.reposts += 1;
        }
        firstInBatch.set(fingerprint, job.url!);
      }

      toCreate.push(job);
    }

    // skipDuplicates: a deduplicação é do banco (URL e source+externalId
    // únicos). Dois jobs da fila gravando ao mesmo tempo não duplicam nada.
    if (toCreate.length > 0) {
      const { count } = await this.prisma.job.createMany({ data: toCreate, skipDuplicates: true });
      result.created = count;
    }

    if (batchAliases.length > 0) {
      const owners = await this.prisma.job.findMany({
        where: { url: { in: [...new Set(batchAliases.map((item) => item.ownerUrl))] } },
        select: { id: true, url: true },
      });
      const idByUrl = new Map(owners.map((owner) => [owner.url!, owner.id]));
      for (const { ownerUrl, alias } of batchAliases) {
        const jobId = idByUrl.get(ownerUrl);
        if (jobId) aliases.push({ ...alias, jobId });
      }
    }

    if (aliases.length > 0) {
      const { count } = await this.prisma.jobAlias.createMany({
        data: aliases,
        skipDuplicates: true,
      });
      result.duplicates = count;
      await this.touch(
        aliases.map((alias) => alias.jobId),
        now,
      );
    }

    // As novas entram sem nota; a fila calcula depois, sem atrasar a gravação.
    if (result.created > 0) {
      this.requestScoring('ingest');
    }

    return result;
  }

  /* ------------------------------------------------- repostadas (11) */

  /** As outras vezes em que esta vaga apareceu, e se as repostagens estão silenciadas. */
  async history(id: string): Promise<JobHistoryDto> {
    const job = await this.findOrThrow(id);
    if (!job.fingerprint) return { repostsMuted: false, occurrences: [] };

    const since = new Date(Date.now() - REPOST_WINDOW_DAYS * DAY_MS);
    const [jobs, forgotten, muted] = await Promise.all([
      this.prisma.job.findMany({
        where: { fingerprint: job.fingerprint, id: { not: id }, lastSeenAt: { gte: since } },
        include: { application: { select: { id: true, status: true, appliedAt: true } } },
      }),
      this.prisma.forgottenJob.findMany({
        where: { fingerprint: job.fingerprint, forgottenAt: { gte: since } },
      }),
      this.prisma.mutedRepost.findUnique({ where: { fingerprint: job.fingerprint } }),
    ]);

    const occurrences: JobOccurrenceDto[] = [
      ...jobs.map((row) => ({
        jobId: row.id,
        source: row.source,
        url: row.url,
        firstSeenAt: row.firstSeenAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        triage: row.triage,
        triagedAt: row.triagedAt?.toISOString() ?? null,
        application: row.application
          ? { ...row.application, appliedAt: row.application.appliedAt.toISOString() }
          : null,
      })),
      ...forgotten.map((row) => ({
        jobId: null,
        source: row.source,
        url: row.url,
        firstSeenAt: null,
        lastSeenAt: row.forgottenAt.toISOString(),
        triage: 'forgotten' as const,
        triagedAt: null,
        application: null,
      })),
    ].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));

    return { repostsMuted: Boolean(muted), occurrences };
  }

  /** Liga/desliga "descartar sozinha se for repostada" para a impressão desta vaga. */
  async muteReposts(id: string, input: MuteRepostsInput): Promise<JobHistoryDto> {
    const job = await this.findOrThrow(id);
    if (!job.fingerprint) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Não dá para reconhecer repostagens desta vaga (título ou empresa vazios).',
      });
    }

    if (input.muted) {
      await this.prisma.mutedRepost.upsert({
        where: { fingerprint: job.fingerprint },
        create: { fingerprint: job.fingerprint, title: job.title, company: job.company },
        update: {},
      });
    } else {
      await this.prisma.mutedRepost.deleteMany({ where: { fingerprint: job.fingerprint } });
    }
    return this.history(id);
  }

  /**
   * Vagas antigas (de antes desta versão) sem impressão: calcula em lotes.
   * Roda na subida; não liga nada retroativamente — só as próximas chegadas.
   */
  async backfillFingerprints(batch = 500): Promise<number> {
    let updated = 0;
    let after = '';
    for (;;) {
      const rows = await this.prisma.job.findMany({
        where: { fingerprint: null, id: { gt: after } },
        orderBy: { id: 'asc' },
        take: batch,
        select: { id: true, title: true, company: true, location: true, workModel: true },
      });
      if (rows.length === 0) return updated;
      for (const row of rows) {
        const fingerprint = jobFingerprint(row);
        if (fingerprint) {
          await this.prisma.job.update({ where: { id: row.id }, data: { fingerprint } });
          updated += 1;
        }
      }
      after = rows.at(-1)!.id;
    }
  }

  /* ----------------------------------------------------------- internos */

  /** A vaga foi trazida por outro link: continua aberta. */
  private async touch(jobIds: string[], now: Date): Promise<void> {
    await this.prisma.job.updateMany({
      where: { id: { in: [...new Set(jobIds)] } },
      data: { lastSeenAt: now, closedAt: null, closedReason: null },
    });
  }

  /** Sem esperar: a nota é trabalho de fundo e nunca segura a resposta. */
  private requestScoring(reason: string): void {
    void this.scoring?.request(reason);
  }

  private scoreVersion(): Promise<number> {
    return loadScoreVersion(this.prisma);
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

const DAY_MS = 24 * 60 * 60 * 1000;

const isString = (value: string | null | undefined): value is string => Boolean(value);

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    map.set(k, [...(map.get(k) ?? []), item]);
  }
  return map;
}
