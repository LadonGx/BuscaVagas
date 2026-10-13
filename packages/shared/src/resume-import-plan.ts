import { z } from 'zod';
import {
  resumeSectionKindSchema,
  SKILL_SECTION_PATTERN,
  type EntryItem,
  type FieldItem,
  type ResumeDto,
  type ResumeSectionDto,
  type ResumeSectionKind,
  type TextItem,
} from './resume';
import { foldText, type ResumeImportDraft } from './resume-import';

/**
 * Importar currículo de PDF, parte 2: o rascunho lido do PDF comparado com o
 * currículo atual vira uma lista de mudanças para revisar. Regra: só
 * completa — campo vazio é preenchido (marcado), campo preenchido fica como
 * está (a mudança aparece desmarcada), entrada repetida é pulada.
 *
 * Plano: docs/features/12-resume-import.md
 */

interface ChangeBase {
  id: string;
  /** Seção de destino; `null` = não existe e será criada com `sectionTitle`. */
  sectionId: string | null;
  sectionTitle: string;
  sectionKind: ResumeSectionKind;
  /** Vai ser aplicada? Começa pela regra; você muda na revisão. */
  selected: boolean;
}

export interface FieldChange extends ChangeBase {
  type: 'field';
  /** Campo que já existe; `null` = campo novo. */
  itemId: string | null;
  label: string;
  current: string;
  incoming: string;
}

export interface TextChange extends ChangeBase {
  type: 'text';
  itemId: string | null;
  current: string;
  incoming: string;
}

export interface EntryChange extends ChangeBase {
  type: 'entry';
  data: EntryItem;
  /** Já existe uma entrada com o mesmo título e organização. */
  duplicate: boolean;
}

export type ImportChange = FieldChange | TextChange | EntryChange;

/* --------------------------------------------------- seções de destino */

type Target =
  | 'personal'
  | 'contact'
  | 'links'
  | 'summary'
  | 'experience'
  | 'education'
  | 'projects'
  | 'skills'
  | 'languages'
  | 'courses';

/** Como achar a seção no currículo (pelo título) e o título/tipo se precisar criar. */
const TARGETS: Record<Target, { pattern: RegExp; title: string; kind: ResumeSectionKind }> = {
  personal: {
    pattern: /dados pessoais|informacoes pessoais|pessoal/,
    title: 'Dados pessoais',
    kind: 'fields',
  },
  contact: { pattern: /contato/, title: 'Contato', kind: 'fields' },
  links: { pattern: /links|redes|perfis/, title: 'Links', kind: 'fields' },
  summary: { pattern: /resumo|sobre|perfil|objetivo/, title: 'Resumo profissional', kind: 'text' },
  experience: {
    pattern: /experiencia|historico profissional/,
    title: 'Experiência',
    kind: 'entries',
  },
  education: { pattern: /formacao|educacao|escolaridade/, title: 'Formação', kind: 'entries' },
  projects: { pattern: /projeto/, title: 'Projetos', kind: 'entries' },
  skills: { pattern: SKILL_SECTION_PATTERN, title: 'Competências', kind: 'fields' },
  languages: { pattern: /idioma|lingua/, title: 'Idiomas', kind: 'fields' },
  courses: { pattern: /curso|certifica/, title: 'Cursos e certificações', kind: 'entries' },
};

function findSection(resume: ResumeDto, target: Target): ResumeSectionDto | null {
  const { pattern, kind } = TARGETS[target];
  return (
    resume.sections.find(
      (section) => section.kind === kind && pattern.test(foldText(section.title)),
    ) ?? null
  );
}

/* ------------------------------------------------ competências */

/** Grupos de "Competências" do modelo padrão. O que não cai em nenhum vai para Ferramentas. */
const SKILL_GROUPS: { label: RegExp; name: string; match: RegExp }[] = [
  {
    label: /linguage/,
    name: 'Linguagens',
    match:
      /^(typescript|javascript|java|kotlin|python|c#|c\+\+|c|go|golang|rust|ruby|php|swift|dart|scala|elixir|r|sql|html5?|css3?|sass|shell|bash|delphi|cobol|visual basic|vb\.net|objective-c|lua|perl)$/,
  },
  {
    label: /framework|bibliotec|librar/,
    name: 'Frameworks',
    match:
      /^(react( native)?|react\.js|next(\.js)?|nestjs|nest(\.js)?|node(\.js)?|express(\.js)?|angular(js)?|vue(\.js)?|nuxt(\.js)?|svelte|spring( boot)?|django|flask|fastapi|laravel|rails|ruby on rails|\.net( core)?|asp\.net|flutter|ionic|electron|jquery|bootstrap|tailwind( css)?|redux|prisma|typeorm|hibernate|jest|vitest|cypress|playwright|junit|quarkus|micronaut|symfony)$/,
  },
  {
    label: /banco|dados|database/,
    name: 'Banco de dados',
    match:
      /^(postgres(ql)?|mysql|mariadb|mongodb|mongo|redis|sql server|oracle|sqlite|dynamodb|firebase|firestore|cassandra|elasticsearch|neo4j|supabase|couchdb|db2)$/,
  },
];

function skillGroup(skill: string): string {
  const folded = foldText(skill);
  return SKILL_GROUPS.find((group) => group.match.test(folded))?.name ?? 'Ferramentas';
}

/** "React, Docker" + "Docker, Git" → "React, Docker, Git" (sem repetir, sem diferenciar maiúsculas). */
function mergeList(current: string, incoming: readonly string[]): string {
  const items = current
    .split(/\s*[,;]\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
  const seen = new Set(items.map(foldText));
  for (const item of incoming) {
    if (!seen.has(foldText(item))) {
      items.push(item);
      seen.add(foldText(item));
    }
  }
  return items.join(', ');
}

/**
 * Mesmo valor escrito de outro jeito? "Campinas, SP" = "Campinas/SP";
 * telefone compara os últimos 11 dígitos ("+55 19 9..." = "(19) 9...").
 */
export function sameValue(a: string, b: string): boolean {
  const key = (value: string) => foldText(value).replace(/[^a-z0-9]+/g, '');
  const digits = (value: string) => value.replace(/\D+/g, '');
  const isPhone = (value: string) => digits(value).length >= 10 && /^[\d\s()+.-]+$/.test(value);
  if (isPhone(a) && isPhone(b)) return digits(a).slice(-11) === digits(b).slice(-11);
  return key(a) === key(b);
}

/** Vazio ou valor de exemplo que ninguém usa de verdade ("voce@email.com"). */
function isEmptyValue(value: string): boolean {
  const text = foldText(value);
  return (
    text === '' ||
    /^(voce|seu|sua|seunome|nome|your|yourname|exemplo|example|teste|test)@/.test(text) ||
    /@(exemplo|example)\.com/.test(text)
  );
}

/* -------------------------------------------------------- o plano */

export function buildImportPlan(resume: ResumeDto, draft: ResumeImportDraft): ImportChange[] {
  const changes: ImportChange[] = [];
  let next = 0;
  const id = () => `c${++next}`;

  const base = (target: Target) => {
    const section = findSection(resume, target);
    return {
      section,
      meta: {
        sectionId: section?.id ?? null,
        sectionTitle: section?.title ?? TARGETS[target].title,
        sectionKind: TARGETS[target].kind,
      },
    };
  };

  /** Campo: acha pelo rótulo; vazio → preenche (marcado); diferente → mostra (desmarcado). */
  const field = (target: Target, labelPattern: RegExp, newLabel: string, value: string | null) => {
    if (!value) return;
    const { section, meta } = base(target);
    const item = section?.items.find((candidate) =>
      labelPattern.test(foldText((candidate.data as FieldItem).label)),
    );
    const current = item ? (item.data as FieldItem).value : '';
    if (sameValue(current, value)) return;
    changes.push({
      id: id(),
      type: 'field',
      ...meta,
      itemId: item?.id ?? null,
      label: item ? (item.data as FieldItem).label : newLabel,
      current,
      incoming: value,
      selected: isEmptyValue(current),
    });
  };

  const { contact } = draft;
  field('personal', /^nome/, 'Nome completo', draft.name);
  field('personal', /titulo|cargo/, 'Título profissional', draft.headline);
  field('personal', /cidade|local|endereco/, 'Cidade/UF', contact.location);
  field('contact', /e-?mail/, 'E-mail', contact.email);
  field('contact', /telefone|whats|celular|fone|phone/, 'Telefone/WhatsApp', contact.phone);
  field('links', /linkedin/, 'LinkedIn', contact.linkedin);
  field('links', /github/, 'GitHub', contact.github);
  field('links', /portf|site/, 'Portfólio', contact.portfolio);

  if (draft.summary) {
    const { section, meta } = base('summary');
    const item = section?.items[0];
    const current = item ? (item.data as TextItem).text : '';
    if (!sameValue(current, draft.summary)) {
      changes.push({
        id: id(),
        type: 'text',
        ...meta,
        itemId: item?.id ?? null,
        current,
        incoming: draft.summary,
        selected: isEmptyValue(current),
      });
    }
  }

  for (const target of ['experience', 'education', 'projects', 'courses'] as const) {
    const { section, meta } = base(target);
    const key = (entry: Pick<EntryItem, 'title' | 'organization'>) =>
      [entry.title, entry.organization ?? '']
        .map((part) => foldText(part).replace(/[^a-z0-9]+/g, ''))
        .join('|');
    const existing = new Set(section?.items.map((item) => key(item.data as EntryItem)) ?? []);
    for (const entry of draft[target]) {
      const duplicate = existing.has(key(entry));
      changes.push({
        id: id(),
        type: 'entry',
        ...meta,
        data: entry,
        duplicate,
        selected: !duplicate,
      });
    }
  }

  // Competências: grupos com rótulo vão para o campo de mesmo nome; o resto
  // é distribuído entre Linguagens, Frameworks, Banco de dados e Ferramentas.
  const byLabel = new Map<string, string[]>();
  for (const group of draft.skills) {
    if (group.label) {
      byLabel.set(group.label, [...(byLabel.get(group.label) ?? []), ...group.values]);
      continue;
    }
    for (const value of group.values) {
      const name = skillGroup(value);
      byLabel.set(name, [...(byLabel.get(name) ?? []), value]);
    }
  }
  for (const [label, values] of byLabel) {
    const { section, meta } = base('skills');
    const known = SKILL_GROUPS.find((group) => group.name === label);
    const item = section?.items.find((candidate) => {
      const current = foldText((candidate.data as FieldItem).label);
      return (
        current === foldText(label) ||
        (known ? known.label.test(current) : false) ||
        (label === 'Ferramentas' && /ferrament|outr/.test(current))
      );
    });
    const current = item ? (item.data as FieldItem).value : '';
    const incoming = mergeList(current, values);
    if (incoming === current) continue;
    changes.push({
      id: id(),
      type: 'field',
      ...meta,
      itemId: item?.id ?? null,
      label: item ? (item.data as FieldItem).label : label,
      current,
      incoming,
      selected: isEmptyValue(current),
    });
  }

  // Sem nível ("Inglês" sozinho) não há o que preencher.
  for (const language of draft.languages.filter((item) => item.value)) {
    const pattern = new RegExp(
      `^${foldText(language.label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
    );
    field('languages', pattern, language.label, language.value);
  }

  for (const other of draft.other) {
    const section = resume.sections.find(
      (candidate) =>
        candidate.kind === 'text' && foldText(candidate.title) === foldText(other.title),
    );
    const item = section?.items[0];
    const current = item ? (item.data as TextItem).text : '';
    if (sameValue(current, other.text)) continue;
    changes.push({
      id: id(),
      type: 'text',
      sectionId: section?.id ?? null,
      sectionTitle: section?.title ?? other.title,
      sectionKind: 'text',
      itemId: item?.id ?? null,
      current,
      incoming: other.text,
      selected: isEmptyValue(current),
    });
  }

  return changes;
}

/* ------------------------------------------------------- aplicar */

const itemData = z.record(z.string(), z.unknown());

/** `POST /api/resume/import`: tudo numa transação; cada item é validado pelo tipo da seção. */
export const resumeImportApplySchema = z
  .object({
    updates: z
      .array(z.object({ itemId: z.string().min(1), data: itemData }))
      .max(200)
      .default([]),
    creates: z
      .array(z.object({ sectionId: z.string().min(1), data: itemData }))
      .max(200)
      .default([]),
    sections: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(80),
          kind: resumeSectionKindSchema,
          items: z.array(itemData).max(100),
        }),
      )
      .max(20)
      .default([]),
  })
  .refine((input) => input.updates.length + input.creates.length + input.sections.length > 0, {
    message: 'Nada para importar',
  });
export type ResumeImportApplyInput = z.output<typeof resumeImportApplySchema>;

function changeData(change: ImportChange): Record<string, unknown> {
  switch (change.type) {
    case 'field':
      return { label: change.label, value: change.incoming };
    case 'text':
      return { text: change.incoming };
    case 'entry':
      return { ...change.data };
  }
}

/** As mudanças marcadas → o corpo do `POST /api/resume/import`. */
export function planToApplyInput(changes: readonly ImportChange[]): ResumeImportApplyInput {
  const input: ResumeImportApplyInput = { updates: [], creates: [], sections: [] };
  for (const change of changes) {
    if (!change.selected) continue;
    const data = changeData(change);
    const itemId = change.type === 'entry' ? null : change.itemId;
    if (itemId) {
      input.updates.push({ itemId, data });
    } else if (change.sectionId) {
      input.creates.push({ sectionId: change.sectionId, data });
    } else {
      const section = input.sections.find(
        (candidate) =>
          candidate.title === change.sectionTitle && candidate.kind === change.sectionKind,
      );
      if (section) section.items.push(data);
      else
        input.sections.push({
          title: change.sectionTitle,
          kind: change.sectionKind,
          items: [data],
        });
    }
  }
  return input;
}
