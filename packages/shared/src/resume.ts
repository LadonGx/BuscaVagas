import { z } from 'zod';
import { optionalText } from './common';

/**
 * Currículo em blocos ("gaveta"): cada item é uma unidade pronta para copiar
 * e colar em formulário de candidatura.
 * Plano: docs/features/04-resume.md
 */

export const RESUME_SECTION_KINDS = ['fields', 'text', 'entries'] as const;
export const resumeSectionKindSchema = z.enum(RESUME_SECTION_KINDS);
export type ResumeSectionKind = z.infer<typeof resumeSectionKindSchema>;

/* -------------------------------------------------- formato dos itens */

const yearMonth = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use o formato AAAA-MM')
  .nullable()
  .optional();

/** `fields`: rótulo + valor. Valor vazio é permitido (modelo para preencher). */
export const fieldItemSchema = z.object({
  label: z.string().trim().min(1).max(80),
  value: z.string().trim().max(5_000),
});
export type FieldItem = z.output<typeof fieldItemSchema>;

/** `text`: um bloco de texto livre. */
export const textItemSchema = z.object({
  text: z.string().trim().max(10_000),
});
export type TextItem = z.output<typeof textItemSchema>;

/** `entries`: experiência, formação, projeto, curso... */
export const entryItemSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    organization: optionalText(200),
    location: optionalText(200),
    startDate: yearMonth,
    endDate: yearMonth,
    current: z.boolean().default(false),
    description: optionalText(5_000),
  })
  .superRefine((entry, ctx) => {
    if (entry.current && entry.endDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'Item atual não tem data de fim',
      });
    }
    // AAAA-MM compara certo como texto.
    if (entry.startDate && entry.endDate && entry.startDate > entry.endDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'A data de fim é anterior à de início',
      });
    }
  });
export type EntryItem = z.output<typeof entryItemSchema>;

export type ResumeItemData = FieldItem | TextItem | EntryItem;

/** Schema dos dados de um item conforme o tipo da seção. */
export function resumeItemDataSchema(kind: ResumeSectionKind) {
  switch (kind) {
    case 'fields':
      return fieldItemSchema;
    case 'text':
      return textItemSchema;
    case 'entries':
      return entryItemSchema;
  }
}

/* ------------------------------------------------------------- entrada */

export const createResumeSectionInputSchema = z.object({
  title: z.string().trim().min(1).max(80),
  kind: resumeSectionKindSchema,
});
export type CreateResumeSectionInput = z.output<typeof createResumeSectionInputSchema>;

/** O `kind` não muda depois de criada — invalidaria os itens. */
export const updateResumeSectionInputSchema = z.object({
  title: z.string().trim().min(1).max(80),
});
export type UpdateResumeSectionInput = z.output<typeof updateResumeSectionInputSchema>;

/** `data` é validado no service, pelo tipo da seção. */
export const resumeItemInputSchema = z.object({
  data: z.record(z.string(), z.unknown()),
});
export type ResumeItemInput = z.output<typeof resumeItemInputSchema>;

/** Nova ordem: TODOS os ids, sem repetição. */
export const reorderInputSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});
export type ReorderInput = z.output<typeof reorderInputSchema>;

/* --------------------------------------------------------------- saída */

export interface ResumeItemDto {
  id: string;
  position: number;
  data: ResumeItemData;
}

export interface ResumeSectionDto {
  id: string;
  title: string;
  kind: ResumeSectionKind;
  position: number;
  items: ResumeItemDto[];
}

export interface ResumeDto {
  sections: ResumeSectionDto[];
}

/* ------------------------------------------------------ texto p/ copiar */

/** "2024-03" -> "03/2024". */
function formatYearMonth(value: string): string {
  const [year, month] = value.split('-');
  return `${month}/${year}`;
}

export function formatPeriod(entry: Pick<EntryItem, 'startDate' | 'endDate' | 'current'>): string {
  const start = entry.startDate ? formatYearMonth(entry.startDate) : null;
  const end = entry.current ? 'atual' : entry.endDate ? formatYearMonth(entry.endDate) : null;

  if (start && end) return `${start} – ${end}`;
  return start ?? end ?? '';
}

/**
 * Um item em texto pronto para colar. É a mesma função no botão "copiar" do
 * front e no export da API. Item sem conteúdo devolve string vazia.
 */
export function resumeItemToText(kind: ResumeSectionKind, data: ResumeItemData): string {
  switch (kind) {
    case 'fields': {
      const field = data as FieldItem;
      return field.value ? `${field.label}: ${field.value}` : '';
    }
    case 'text':
      return (data as TextItem).text;
    case 'entries': {
      const entry = data as EntryItem;
      const header = [
        entry.title,
        entry.organization ? ` — ${entry.organization}` : '',
        entry.location ? ` (${entry.location})` : '',
      ].join('');
      return [header, formatPeriod(entry), entry.description ?? '']
        .filter((line) => line.length > 0)
        .join('\n');
    }
  }
}

/** O currículo inteiro em texto puro, para campos "cole seu currículo". */
export function resumeToText(sections: readonly ResumeSectionDto[]): string {
  const blocks: string[] = [];

  for (const section of sections) {
    const items = section.items
      .map((item) => resumeItemToText(section.kind, item.data))
      .filter((text) => text.length > 0);

    if (items.length === 0) {
      continue;
    }

    // Campos ficam um por linha; textos e entradas, separados por linha em branco.
    const body = items.join(section.kind === 'fields' ? '\n' : '\n\n');
    blocks.push(`${section.title.toUpperCase()}\n${body}`);
  }

  return blocks.join('\n\n') + (blocks.length > 0 ? '\n' : '');
}
