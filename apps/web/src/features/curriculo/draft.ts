import {
  resumeItemDataSchema,
  resumeItemToText,
  resumeToText,
  type EntryItem,
  type FieldItem,
  type ResumeItemData,
  type ResumeSectionDto,
  type ResumeSectionKind,
  type TextItem,
} from '@busca-vagas/shared';

/** Rascunho do que foi digitado e ainda não salvo, por id do item. */
export type Drafts = Record<string, ResumeItemData>;

/** Erros de validação por item → campo (`label`, `value`, `title`, `endDate`…). */
export type ItemErrors = Record<string, Record<string, string>>;

const clean = (value: string | null | undefined): string => (value ?? '').trim();
const orNull = (value: string | null | undefined): string | null => clean(value) || null;

/**
 * O item como a API guardaria: textos aparados e opcionais vazios como
 * `null`. Também serve para comparar rascunho com o salvo sem acusar
 * mudança por espaço no fim ou por `undefined` × `null`.
 */
export function normalizeItem(kind: ResumeSectionKind, data: ResumeItemData): ResumeItemData {
  switch (kind) {
    case 'fields': {
      const field = data as FieldItem;
      return { label: clean(field.label), value: clean(field.value) };
    }
    case 'text':
      return { text: clean((data as TextItem).text) };
    case 'entries': {
      const entry = data as EntryItem;
      return {
        title: clean(entry.title),
        organization: orNull(entry.organization),
        location: orNull(entry.location),
        startDate: orNull(entry.startDate),
        endDate: orNull(entry.endDate),
        current: Boolean(entry.current),
        description: orNull(entry.description),
      };
    }
  }
}

export function sameItem(kind: ResumeSectionKind, a: ResumeItemData, b: ResumeItemData): boolean {
  // As chaves saem sempre na mesma ordem de `normalizeItem`.
  return JSON.stringify(normalizeItem(kind, a)) === JSON.stringify(normalizeItem(kind, b));
}

/** Erros do schema do `shared`, em português. Vazio = válido. */
export function validateItem(
  kind: ResumeSectionKind,
  data: ResumeItemData,
): Record<string, string> {
  const result = resumeItemDataSchema(kind).safeParse(normalizeItem(kind, data));
  if (result.success) return {};

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? 'form');
    if (errors[key]) continue;
    if (issue.code === 'too_small') errors[key] = 'Preencha este campo.';
    else if (issue.code === 'too_big') {
      errors[key] = `Use no máximo ${Number(issue.maximum).toLocaleString('pt-BR')} caracteres.`;
    } else errors[key] = issue.message;
  }
  return errors;
}

/** Texto de um item para copiar — o mesmo do `/resume/export`. */
export function itemText(kind: ResumeSectionKind, data: ResumeItemData): string {
  return resumeItemToText(kind, normalizeItem(kind, data));
}

/** A seção com o rascunho aplicado: o que está na tela. */
export function withDrafts(section: ResumeSectionDto, drafts: Drafts): ResumeSectionDto {
  return {
    ...section,
    items: section.items.map((item) => {
      const draft = drafts[item.id];
      return draft ? { ...item, data: draft } : item;
    }),
  };
}

/** Texto da seção inteira para copiar (sem o título). */
export function sectionText(section: ResumeSectionDto): string {
  return section.items
    .map((item) => itemText(section.kind, item.data))
    .filter((text) => text.length > 0)
    .join(section.kind === 'fields' ? '\n' : '\n\n');
}

/** O currículo inteiro em texto, com o rascunho — o mesmo formato do `/resume/export`. */
export function resumeText(sections: readonly ResumeSectionDto[], drafts: Drafts): string {
  return resumeToText(
    sections.map((section) => {
      const shown = withDrafts(section, drafts);
      return {
        ...shown,
        items: shown.items.map((item) => ({
          ...item,
          data: normalizeItem(section.kind, item.data),
        })),
      };
    }),
  );
}

/** Nome curto de um item, para rótulos de botão ("Apagar E-mail"). */
export function itemName(section: ResumeSectionDto, data: ResumeItemData): string {
  switch (section.kind) {
    case 'fields':
      return clean((data as FieldItem).label) || 'campo';
    case 'entries':
      return clean((data as EntryItem).title) || 'item';
    case 'text':
      return section.title;
  }
}

/** Entrada em branco, para o formulário de nova entrada. */
export function emptyEntry(): EntryItem {
  return {
    title: '',
    organization: null,
    location: null,
    startDate: null,
    endDate: null,
    current: false,
    description: null,
  };
}
