import { z } from 'zod';
import type {
  EntryItem,
  FieldItem,
  ResumeItemDto,
  ResumeSectionDto,
  ResumeSectionKind,
  TextItem,
} from './resume';

/**
 * O currículo de cada candidatura (docs/features/14-resume-versions.md):
 * a cópia do currículo do app no "Me candidatei" e o PDF que você enviou.
 */

/** PDF enviado: até 10 MB (o mesmo limite da importação). */
export const RESUME_FILE_MAX_BYTES = 10 * 1024 * 1024;

/** O que a candidatura sabe da cópia guardada (o conteúdo vem em outra rota). */
export interface ApplicationResumeDto {
  snapshotId: string;
  /** Quando foi guardada para esta candidatura. */
  savedAt: string;
  /** O currículo de hoje é igual à cópia? */
  sameAsCurrent: boolean;
}

export interface ApplicationResumeFileDto {
  name: string;
  /** Bytes. */
  size: number;
  uploadedAt: string;
}

/** `GET /api/applications/:id/resume`: a cópia inteira. */
export interface ResumeSnapshotDto {
  id: string;
  savedAt: string;
  sections: ResumeSectionDto[];
}

/** `PUT /api/applications/:id/resume-file`: o PDF em base64 (a API só aceita JSON). */
export const resumeFileInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contentBase64: z
    .string()
    .min(1)
    // base64 de 10 MB ≈ 13,4 MB de texto.
    .max(Math.ceil((RESUME_FILE_MAX_BYTES * 4) / 3) + 4)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Conteúdo em base64 inválido'),
});
export type ResumeFileInput = z.output<typeof resumeFileInputSchema>;

/* ------------------------------------------------------------- conteúdo */

const itemText = (kind: ResumeSectionKind, data: unknown): string => {
  if (kind === 'fields') return ((data as FieldItem).value ?? '').trim();
  if (kind === 'text') return ((data as TextItem).text ?? '').trim();
  return ((data as EntryItem).title ?? '').trim();
};

/** Algum campo, texto ou entrada com conteúdo (currículo vazio não vira cópia). */
export function resumeHasContent(sections: readonly ResumeSectionDto[]): boolean {
  return sections.some((section) =>
    section.items.some((item) => itemText(section.kind, item.data).length > 0),
  );
}

/** Ordena chaves para que o mesmo conteúdo dê sempre o mesmo texto. */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .map((key) => [key, stable((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/**
 * O currículo como texto canônico (ordem das seções e itens, ids e dados; sem
 * datas de criação). A API guarda o hash disto: o mesmo currículo enviado em
 * cinco candidaturas vira uma cópia só.
 */
export function canonicalResume(sections: readonly ResumeSectionDto[]): string {
  const ordered = [...sections]
    .sort((a, b) => a.position - b.position)
    .map((section, position) => ({
      id: section.id,
      title: section.title,
      kind: section.kind,
      position,
      items: [...section.items]
        .sort((a, b) => a.position - b.position)
        .map((item, index) => ({ id: item.id, position: index, data: item.data })),
    }));
  return JSON.stringify(stable(ordered));
}

/* ------------------------------------------------------------ comparação */

export type ResumeChangeKind =
  | 'section-added'
  | 'section-removed'
  | 'section-renamed'
  | 'item-added'
  | 'item-removed'
  | 'item-changed'
  | 'reordered';

export interface ResumeChange {
  kind: ResumeChangeKind;
  /** Seção como está hoje (ou como estava, se saiu). */
  section: string;
  /** O item: rótulo do campo, título da entrada, "Texto". */
  item: string | null;
  /** O que mudou no item: "Valor", "Período", "Descrição"... */
  fields: string[];
  /** Resumo de antes e depois (campo e texto curtos). */
  before: string | null;
  after: string | null;
}

const ENTRY_FIELDS: [label: string, read: (entry: EntryItem) => string][] = [
  ['Título', (entry) => entry.title ?? ''],
  ['Organização', (entry) => entry.organization ?? ''],
  ['Local', (entry) => entry.location ?? ''],
  [
    'Período',
    (entry) => `${entry.startDate ?? ''}|${entry.endDate ?? ''}|${entry.current ? 'atual' : ''}`,
  ],
  ['Descrição', (entry) => entry.description ?? ''],
];

const short = (text: string, max = 140) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

function itemLabel(kind: ResumeSectionKind, item: ResumeItemDto): string {
  if (kind === 'fields') return (item.data as FieldItem).label;
  if (kind === 'text') return 'Texto';
  const entry = item.data as EntryItem;
  return entry.organization ? `${entry.title} — ${entry.organization}` : entry.title;
}

function itemSummary(kind: ResumeSectionKind, item: ResumeItemDto): string | null {
  if (kind === 'entries') return null;
  const text = itemText(kind, item.data);
  return text ? short(text) : null;
}

function compareItem(
  kind: ResumeSectionKind,
  before: ResumeItemDto,
  after: ResumeItemDto,
): Pick<ResumeChange, 'fields' | 'before' | 'after'> | null {
  if (kind === 'entries') {
    const fields = ENTRY_FIELDS.filter(
      ([, read]) => read(before.data as EntryItem).trim() !== read(after.data as EntryItem).trim(),
    ).map(([label]) => label);
    return fields.length > 0 ? { fields, before: null, after: null } : null;
  }
  if (kind === 'fields') {
    const a = before.data as FieldItem;
    const b = after.data as FieldItem;
    const fields = [
      ...(a.label.trim() !== b.label.trim() ? ['Rótulo'] : []),
      ...((a.value ?? '').trim() !== (b.value ?? '').trim() ? ['Valor'] : []),
    ];
    if (fields.length === 0) return null;
    return { fields, before: itemSummary(kind, before), after: itemSummary(kind, after) };
  }
  const a = itemText(kind, before.data);
  const b = itemText(kind, after.data);
  return a === b ? null : { fields: ['Texto'], before: short(a), after: short(b) };
}

/** Os ids em comum estão na mesma ordem? */
function sameOrder(before: readonly { id: string }[], after: readonly { id: string }[]) {
  const ids = new Set(after.map((item) => item.id));
  const kept = before.filter((item) => ids.has(item.id)).map((item) => item.id);
  const known = new Set(kept);
  const now = after.filter((item) => known.has(item.id)).map((item) => item.id);
  return kept.every((id, index) => id === now[index]);
}

const byPosition = <T extends { position: number }>(list: readonly T[]) =>
  [...list].sort((a, b) => a.position - b.position);

/**
 * O que mudou do currículo enviado (`before`) para o de hoje (`after`).
 * Seções e itens são casados pelo id: apagar e criar de novo aparece como
 * "saiu" + "entrou". Item vazio dos dois lados não conta.
 */
export function diffResume(
  beforeSections: readonly ResumeSectionDto[],
  afterSections: readonly ResumeSectionDto[],
): ResumeChange[] {
  const changes: ResumeChange[] = [];
  const before = byPosition(beforeSections);
  const after = byPosition(afterSections);
  const oldById = new Map(before.map((section) => [section.id, section]));
  const newIds = new Set(after.map((section) => section.id));
  const change = (partial: Partial<ResumeChange> & Pick<ResumeChange, 'kind' | 'section'>) =>
    changes.push({ item: null, fields: [], before: null, after: null, ...partial });
  const filled = (kind: ResumeSectionKind, item: ResumeItemDto) =>
    itemText(kind, item.data).length > 0;

  if (!sameOrder(before, after)) change({ kind: 'reordered', section: 'Seções' });

  for (const section of after) {
    const old = oldById.get(section.id);
    if (!old) {
      if (section.items.some((item) => filled(section.kind, item))) {
        change({ kind: 'section-added', section: section.title });
      }
      continue;
    }
    if (old.title.trim() !== section.title.trim()) {
      change({
        kind: 'section-renamed',
        section: section.title,
        before: old.title,
        after: section.title,
      });
    }

    const oldItems = byPosition(old.items);
    const newItems = byPosition(section.items);
    const oldItemById = new Map(oldItems.map((item) => [item.id, item]));
    const newItemIds = new Set(newItems.map((item) => item.id));

    for (const item of newItems) {
      const previous = oldItemById.get(item.id);
      if (!previous) {
        if (filled(section.kind, item)) {
          change({
            kind: 'item-added',
            section: section.title,
            item: itemLabel(section.kind, item),
            after: itemSummary(section.kind, item),
          });
        }
        continue;
      }
      const diff = compareItem(section.kind, previous, item);
      if (diff) {
        change({
          kind: 'item-changed',
          section: section.title,
          item: itemLabel(section.kind, item),
          ...diff,
        });
      }
    }
    for (const item of oldItems) {
      if (!newItemIds.has(item.id) && filled(section.kind, item)) {
        change({
          kind: 'item-removed',
          section: section.title,
          item: itemLabel(section.kind, item),
          before: itemSummary(section.kind, item),
        });
      }
    }
    if (!sameOrder(oldItems, newItems)) change({ kind: 'reordered', section: section.title });
  }

  for (const section of before) {
    if (!newIds.has(section.id) && section.items.some((item) => filled(section.kind, item))) {
      change({ kind: 'section-removed', section: section.title });
    }
  }

  return changes;
}

/** "Experiência · Dev — Acme: Período, Descrição" — uma linha por mudança. */
export function describeResumeChange(change: ResumeChange): string {
  const where = change.item ? `${change.section} · ${change.item}` : change.section;
  switch (change.kind) {
    case 'section-added':
      return `Seção nova: ${change.section}`;
    case 'section-removed':
      return `Seção removida: ${change.section}`;
    case 'section-renamed':
      return `Seção renomeada: "${change.before}" → "${change.after}"`;
    case 'item-added':
      return `Entrou: ${where}`;
    case 'item-removed':
      return `Saiu: ${where}`;
    case 'item-changed':
      return `${where}: ${change.fields.join(', ')}`;
    case 'reordered':
      return change.section === 'Seções'
        ? 'Ordem das seções mudou'
        : `Ordem mudou em ${change.section}`;
  }
}
