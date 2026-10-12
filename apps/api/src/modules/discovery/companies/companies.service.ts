import type { JobPosting } from '@busca-vagas/shared';
import type {
  AddCompanyInput,
  AddCompanyResultDto,
  CheckCompanyInput,
  CompanyCheckDto,
  CompanyDirectoryDto,
  TrackedCompanyDto,
  UpdateCompanyInput,
} from '@busca-vagas/shared';
import {
  companyNameFromSlug,
  parseBoardUrl,
  runSource,
  type BoardCompany,
  type CompanyScanStat,
  type HttpClient,
  type JobSource,
} from '@busca-vagas/sources';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { JobsService } from '../../jobs/jobs.service';
import { SOURCE_HTTP_CLIENT, SOURCES } from '../discovery.constants';
import { boardUrlOf, toTrackedCompanyDto } from './companies.mapper';
import { COMPANY_DIRECTORY, DIRECTORY_VERIFIED_AT } from './company-directory';
import { TrackedCompaniesStore } from './tracked-companies.store';

interface BoardRef {
  source: JobSource;
  slug: string;
}

interface CheckResult {
  stat: CompanyScanStat;
  /** Vagas que passaram nos filtros — entram no banco quando a empresa é adicionada. */
  jobs: JobPosting[];
}

const sameSlug = (slug: string) => ({ equals: slug, mode: 'insensitive' as const });

/**
 * Sem nome escolhido: o que a API do board dá (vem nas vagas). Lever e Ashby
 * não dão — ali o nome das vagas é o derivado do slug, e fica `null`.
 */
function apiName(slug: string, jobs: readonly JobPosting[]): string | null {
  const fromJobs = jobs[0]?.company;
  return fromJobs && fromJobs !== companyNameFromSlug(slug) ? fromJobs : null;
}

/**
 * A lista de empresas dos boards, editada na tela (Preferências → Fontes).
 * Conferir = ler o board agora, sem gravar; adicionar confere antes e já
 * grava as vagas que vieram.
 *
 * Plano: docs/features/06-company-boards.md
 */
@Injectable()
export class CompaniesService {
  private readonly logger = new Logger('Empresas');
  private readonly boards: Map<string, JobSource>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly store: TrackedCompaniesStore,
    private readonly jobs: JobsService,
    @Inject(SOURCES) sources: JobSource[],
    @Inject(SOURCE_HTTP_CLIENT) private readonly http: HttpClient,
  ) {
    this.boards = new Map(
      sources.filter((source) => source.kind === 'company-board').map((s) => [s.id, s]),
    );
  }

  /** Por fonte, e pelo nome dentro de cada fonte. */
  async list(): Promise<TrackedCompanyDto[]> {
    const rows = await this.prisma.trackedCompany.findMany();
    return rows
      .map(toTrackedCompanyDto)
      .sort(
        (a, b) =>
          a.source.localeCompare(b.source) ||
          a.displayName.localeCompare(b.displayName, 'pt-BR', { sensitivity: 'base' }),
      );
  }

  async check(input: CheckCompanyInput): Promise<CompanyCheckDto> {
    const ref = this.resolve(input);
    const { stat } = await this.read(ref.source, { slug: ref.slug, name: null });
    const tracked = await this.findTracked(ref);
    return {
      source: ref.source.id,
      slug: ref.slug,
      status: stat.status,
      jobs: stat.jobs,
      matched: stat.kept,
      error: stat.error,
      boardUrl: boardUrlOf(ref.source.id, ref.slug),
      trackedId: tracked?.id ?? null,
    };
  }

  async add(input: AddCompanyInput): Promise<AddCompanyResultDto> {
    const ref = this.resolve(input);
    const existing = await this.findTracked(ref);
    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        message: `"${existing.name ?? existing.slug}" já está na lista do ${ref.source.displayName}.`,
        companyId: existing.id,
      });
    }

    const { stat, jobs } = await this.read(ref.source, {
      slug: ref.slug,
      name: input.name ?? null,
    });
    if (stat.status === 'not_found') {
      throw new BadRequestException({
        statusCode: 400,
        message: `Não encontrei o board "${ref.slug}" no ${ref.source.displayName}. Confira o link (ou o slug).`,
      });
    }

    const created = await this.prisma.trackedCompany.create({
      data: {
        source: ref.source.id,
        slug: ref.slug,
        name: input.name ?? apiName(ref.slug, jobs),
        lastCheckedAt: new Date(),
        lastStatus: stat.status,
        lastJobs: stat.jobs,
        lastMatched: stat.kept,
        lastError: stat.error,
      },
    });

    const jobsNew = jobs.length > 0 ? (await this.jobs.ingest(jobs)).created : 0;
    this.logger.log(
      `${ref.source.id}: "${ref.slug}" adicionada (${stat.kept} de ${stat.jobs} vagas passam nos filtros, ${jobsNew} novas)`,
    );
    return { company: toTrackedCompanyDto(created), jobsNew };
  }

  async update(id: string, input: UpdateCompanyInput): Promise<TrackedCompanyDto> {
    await this.findOrThrow(id);
    const row = await this.prisma.trackedCompany.update({
      where: { id },
      data: {
        ...(input.active !== undefined && { active: input.active }),
        ...(input.name !== undefined && { name: input.name }),
      },
    });
    return toTrackedCompanyDto(row);
  }

  async remove(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.prisma.trackedCompany.delete({ where: { id } });
  }

  /** Lê o board de uma empresa da lista agora e guarda o resultado. */
  async recheck(id: string): Promise<TrackedCompanyDto> {
    const row = await this.findOrThrow(id);
    const source = this.boards.get(row.source);
    if (!source) {
      throw new BadRequestException({
        statusCode: 400,
        message: `A fonte "${row.source}" não está ativa (veja DISCOVERY_SOURCES no .env).`,
      });
    }
    const { stat } = await this.read(source, { slug: row.slug, name: row.name });
    await this.store.recordScan(row.source, [stat]);
    return toTrackedCompanyDto(await this.findOrThrow(id));
  }

  async directory(): Promise<CompanyDirectoryDto> {
    const rows = await this.prisma.trackedCompany.findMany({
      select: { id: true, source: true, slug: true },
    });
    const key = (source: string, slug: string) => `${source}:${slug.toLowerCase()}`;
    const tracked = new Map(rows.map((row) => [key(row.source, row.slug), row.id]));

    return {
      verifiedAt: DIRECTORY_VERIFIED_AT,
      companies: COMPANY_DIRECTORY.filter((entry) => this.boards.has(entry.source)).map(
        (entry) => ({
          ...entry,
          boardUrl: boardUrlOf(entry.source, entry.slug),
          trackedId: tracked.get(key(entry.source, entry.slug)) ?? null,
        }),
      ),
    };
  }

  /* ------------------------------------------------------------ internos */

  /** Link → (fonte, slug); ou a fonte e o slug informados. */
  private resolve(input: CheckCompanyInput): BoardRef {
    let sourceId = input.source;
    let slug = input.slug;

    if (input.url) {
      const parsed = parseBoardUrl(input.url);
      if (!parsed) {
        throw new BadRequestException({
          statusCode: 400,
          message:
            'Não reconheci o link. Use o link da página de vagas da empresa no Greenhouse, ' +
            'Lever ou Ashby (ex.: https://jobs.lever.co/empresa).',
        });
      }
      sourceId = parsed.sourceId;
      slug = parsed.slug;
    }

    const source = sourceId ? this.boards.get(sourceId) : undefined;
    if (!source || !slug) {
      throw new BadRequestException({
        statusCode: 400,
        message: `A fonte "${sourceId ?? ''}" não é um board de empresa ativo (veja DISCOVERY_SOURCES no .env).`,
      });
    }
    return { source, slug };
  }

  private async read(source: JobSource, company: BoardCompany): Promise<CheckResult> {
    const { jobs, outcome } = await runSource(source, { companies: [company] }, this.http, (m) =>
      this.logger.log(m),
    );
    const stat = outcome.companies?.[0] ?? {
      slug: company.slug,
      status: 'failed' as const,
      jobs: 0,
      kept: 0,
      error: outcome.error ?? 'erro desconhecido',
    };
    return { stat, jobs };
  }

  private findTracked(ref: BoardRef) {
    return this.prisma.trackedCompany.findFirst({
      where: { source: ref.source.id, slug: sameSlug(ref.slug) },
    });
  }

  private async findOrThrow(id: string) {
    const row = await this.prisma.trackedCompany.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({ statusCode: 404, message: 'Empresa não encontrada.' });
    }
    return row;
  }
}
