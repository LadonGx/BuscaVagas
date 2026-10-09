import {
  resumeItemDataSchema,
  resumeToText,
  type CreateResumeSectionInput,
  type ResumeDto,
  type ResumeItemData,
  type ResumeItemDto,
  type ResumeSectionDto,
  type ResumeSectionKind,
  type UpdateResumeSectionInput,
} from '@busca-vagas/shared';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { badRequestFromZod } from '../../common/pipes/zod-validation.pipe';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_RESUME_SECTIONS } from './resume.defaults';

/** Chave do advisory lock que serializa a criação das seções padrão. */
const SEED_LOCK_KEY = 4_815_162_342;

const sectionWithItems = {
  items: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
} satisfies Prisma.ResumeSectionInclude;

type SectionRow = Prisma.ResumeSectionGetPayload<{ include: typeof sectionWithItems }>;

/**
 * Currículo em blocos ("gaveta").
 * Plano: docs/features/04-resume.md
 */
@Injectable()
export class ResumeService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<ResumeDto> {
    await this.ensureDefaults();

    const sections = await this.prisma.resumeSection.findMany({
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: sectionWithItems,
    });

    return { sections: sections.map(toSectionDto) };
  }

  async exportText(): Promise<string> {
    return resumeToText((await this.get()).sections);
  }

  /* ------------------------------------------------------------ seções */

  async createSection(input: CreateResumeSectionInput): Promise<ResumeSectionDto> {
    const last = await this.prisma.resumeSection.aggregate({ _max: { position: true } });
    const section = await this.prisma.resumeSection.create({
      data: { ...input, position: (last._max.position ?? -1) + 1 },
      include: sectionWithItems,
    });
    return toSectionDto(section);
  }

  async updateSection(id: string, input: UpdateResumeSectionInput): Promise<ResumeSectionDto> {
    await this.findSectionOrThrow(id);
    const section = await this.prisma.resumeSection.update({
      where: { id },
      data: input,
      include: sectionWithItems,
    });
    return toSectionDto(section);
  }

  async removeSection(id: string): Promise<void> {
    await this.findSectionOrThrow(id);
    // Itens vão junto (onDelete: Cascade).
    await this.prisma.resumeSection.delete({ where: { id } });
  }

  async reorderSections(ids: readonly string[]): Promise<ResumeDto> {
    const current = await this.prisma.resumeSection.findMany({ select: { id: true } });
    assertSameSet(
      ids,
      current.map((section) => section.id),
      'seções',
    );

    await this.prisma.$transaction(
      ids.map((id, position) =>
        this.prisma.resumeSection.update({ where: { id }, data: { position } }),
      ),
    );

    return this.get();
  }

  /* ------------------------------------------------------------- itens */

  async addItem(sectionId: string, rawData: unknown): Promise<ResumeItemDto> {
    const section = await this.findSectionOrThrow(sectionId);
    const data = parseItemData(section.kind, rawData);
    const last = await this.prisma.resumeItem.aggregate({
      where: { sectionId },
      _max: { position: true },
    });

    const item = await this.prisma.resumeItem.create({
      data: {
        sectionId,
        position: (last._max.position ?? -1) + 1,
        data: data as Prisma.InputJsonValue,
      },
    });
    return toItemDto(item);
  }

  async updateItem(id: string, rawData: unknown): Promise<ResumeItemDto> {
    const item = await this.prisma.resumeItem.findUnique({
      where: { id },
      include: { section: { select: { kind: true } } },
    });

    if (!item) {
      throw itemNotFound();
    }

    const data = parseItemData(item.section.kind, rawData);
    const updated = await this.prisma.resumeItem.update({
      where: { id },
      data: { data: data as Prisma.InputJsonValue },
    });
    return toItemDto(updated);
  }

  async removeItem(id: string): Promise<void> {
    const found = await this.prisma.resumeItem.findUnique({ where: { id }, select: { id: true } });
    if (!found) {
      throw itemNotFound();
    }
    await this.prisma.resumeItem.delete({ where: { id } });
  }

  async reorderItems(sectionId: string, ids: readonly string[]): Promise<ResumeSectionDto> {
    await this.findSectionOrThrow(sectionId);
    const current = await this.prisma.resumeItem.findMany({
      where: { sectionId },
      select: { id: true },
    });
    assertSameSet(
      ids,
      current.map((item) => item.id),
      'itens da seção',
    );

    await this.prisma.$transaction(
      ids.map((id, position) =>
        this.prisma.resumeItem.update({ where: { id }, data: { position } }),
      ),
    );

    const section = await this.prisma.resumeSection.findUniqueOrThrow({
      where: { id: sectionId },
      include: sectionWithItems,
    });
    return toSectionDto(section);
  }

  /* ----------------------------------------------------------- internos */

  /**
   * Cria as seções padrão quando não há nenhuma. O advisory lock faz duas
   * requisições simultâneas (duas abas) esperarem uma pela outra — a segunda
   * vê as seções criadas e não duplica.
   */
  private async ensureDefaults(): Promise<void> {
    if ((await this.prisma.resumeSection.count()) > 0) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${SEED_LOCK_KEY})`);

      if ((await tx.resumeSection.count()) > 0) {
        return;
      }

      for (const [position, section] of DEFAULT_RESUME_SECTIONS.entries()) {
        await tx.resumeSection.create({
          data: {
            title: section.title,
            kind: section.kind,
            position,
            items: {
              create: section.items.map((data, itemPosition) => ({
                position: itemPosition,
                data: data as Prisma.InputJsonValue,
              })),
            },
          },
        });
      }
    });
  }

  private async findSectionOrThrow(id: string) {
    const section = await this.prisma.resumeSection.findUnique({ where: { id } });
    if (!section) {
      throw new NotFoundException({ statusCode: 404, message: 'Seção não encontrada.' });
    }
    return section;
  }
}

/* -------------------------------------------------------------- helpers */

function parseItemData(kind: ResumeSectionKind, raw: unknown): ResumeItemData {
  const result = resumeItemDataSchema(kind).safeParse(raw);
  if (!result.success) {
    throw badRequestFromZod(result.error, ['data']);
  }
  return result.data;
}

/** A nova ordem precisa listar exatamente os ids existentes, sem repetição. */
function assertSameSet(ids: readonly string[], existing: readonly string[], what: string): void {
  const given = new Set(ids);
  const valid =
    given.size === ids.length &&
    given.size === existing.length &&
    existing.every((id) => given.has(id));

  if (!valid) {
    throw new BadRequestException({
      statusCode: 400,
      message: `A nova ordem precisa listar todos os ${what}, uma vez cada.`,
    });
  }
}

function toItemDto(item: { id: string; position: number; data: Prisma.JsonValue }): ResumeItemDto {
  return { id: item.id, position: item.position, data: item.data as unknown as ResumeItemData };
}

function toSectionDto(section: SectionRow): ResumeSectionDto {
  return {
    id: section.id,
    title: section.title,
    kind: section.kind,
    position: section.position,
    items: section.items.map(toItemDto),
  };
}

function itemNotFound(): NotFoundException {
  return new NotFoundException({ statusCode: 404, message: 'Item não encontrado.' });
}
