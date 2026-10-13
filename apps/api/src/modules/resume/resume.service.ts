import { stackFromText } from '@busca-vagas/sources';
import {
  resumeItemDataSchema,
  resumeItemToText,
  resumeToText,
  SKILL_SECTION_PATTERN,
  type FieldItem,
  type CreateResumeSectionInput,
  type ResumeDto,
  type ResumeImportApplyInput,
  type ResumeItemData,
  type ResumeItemDto,
  type ResumeSectionDto,
  type ResumeSectionKind,
  type ResumeStacksDto,
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

  /**
   * Tecnologias do currículo para as preferências. Procura nas seções de
   * competências (pelo título); sem nenhuma, em todas as seções de campos.
   * Em campos, só o valor ("Linguagens: TypeScript" → "TypeScript").
   */
  async stacks(): Promise<ResumeStacksDto> {
    const { sections } = await this.get();
    const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const skills = sections.filter((section) => SKILL_SECTION_PATTERN.test(plain(section.title)));
    const scanned = skills.length > 0 ? skills : sections.filter((s) => s.kind === 'fields');

    const found = new Map<string, string[]>();
    for (const section of scanned) {
      const texts = section.items.map((item) =>
        section.kind === 'fields'
          ? (item.data as FieldItem).value
          : resumeItemToText(section.kind, item.data),
      );
      for (const name of stackFromText(...texts)) {
        found.set(name, [...(found.get(name) ?? []), section.title]);
      }
    }

    return {
      scannedSections: scanned.map((section) => section.title),
      stacks: [...found].map(([name, where]) => ({ name, sections: where })),
    };
  }

  async exportText(): Promise<string> {
    return resumeToText((await this.get()).sections);
  }

  /* --------------------------------------------- importar de PDF (12) */

  /**
   * Aplica o que você aprovou na revisão da importação, tudo ou nada.
   * Cada item é validado pelo tipo da seção de destino; itens novos entram
   * no fim da seção; seções novas, no fim do currículo.
   * Plano: docs/features/12-resume-import.md
   */
  async applyImport(input: ResumeImportApplyInput): Promise<ResumeDto> {
    await this.ensureDefaults();

    await this.prisma.$transaction(async (tx) => {
      for (const [index, update] of input.updates.entries()) {
        const item = await tx.resumeItem.findUnique({
          where: { id: update.itemId },
          include: { section: { select: { kind: true } } },
        });
        if (!item) throw itemNotFound();
        const data = parseItemData(item.section.kind, update.data, [
          'updates',
          String(index),
          'data',
        ]);
        await tx.resumeItem.update({
          where: { id: item.id },
          data: { data: data as Prisma.InputJsonValue },
        });
      }

      for (const [index, create] of input.creates.entries()) {
        const section = await tx.resumeSection.findUnique({ where: { id: create.sectionId } });
        if (!section) throw sectionNotFound();
        const data = parseItemData(section.kind, create.data, ['creates', String(index), 'data']);
        const last = await tx.resumeItem.aggregate({
          where: { sectionId: section.id },
          _max: { position: true },
        });
        await tx.resumeItem.create({
          data: {
            sectionId: section.id,
            position: (last._max.position ?? -1) + 1,
            data: data as Prisma.InputJsonValue,
          },
        });
      }

      for (const [index, section] of input.sections.entries()) {
        const items = section.items.map((raw, itemIndex) =>
          parseItemData(section.kind, raw, ['sections', String(index), 'items', String(itemIndex)]),
        );
        const last = await tx.resumeSection.aggregate({ _max: { position: true } });
        await tx.resumeSection.create({
          data: {
            title: section.title,
            kind: section.kind,
            position: (last._max.position ?? -1) + 1,
            items: {
              create: items.map((data, position) => ({
                position,
                data: data as Prisma.InputJsonValue,
              })),
            },
          },
        });
      }
    });

    return this.get();
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
      throw sectionNotFound();
    }
    return section;
  }
}

/* -------------------------------------------------------------- helpers */

function parseItemData(
  kind: ResumeSectionKind,
  raw: unknown,
  path: string[] = ['data'],
): ResumeItemData {
  const result = resumeItemDataSchema(kind).safeParse(raw);
  if (!result.success) {
    throw badRequestFromZod(result.error, path);
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

function sectionNotFound(): NotFoundException {
  return new NotFoundException({ statusCode: 404, message: 'Seção não encontrada.' });
}

function itemNotFound(): NotFoundException {
  return new NotFoundException({ statusCode: 404, message: 'Item não encontrado.' });
}
