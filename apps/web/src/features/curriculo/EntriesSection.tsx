import { formatPeriod, type EntryItem, type ResumeSectionDto } from '@busca-vagas/shared';
import { Pencil, Plus } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useAddItem } from '../../api/resume';
import { useToast } from '../../components/toast/toast-context';
import { Button } from '../../components/ui/Button';
import { CopyButton } from '../../components/ui/CopyButton';
import { Field } from '../../components/ui/Field';
import { emptyEntry, itemText, normalizeItem, validateItem } from './draft';
import type { SectionBodyProps } from './FieldsSection';
import { ItemTools } from './ItemTools';
import styles from './Section.module.css';

const SINGULAR: Record<string, string> = {
  experiencia: 'experiência',
  experiencias: 'experiência',
  formacao: 'formação',
  projetos: 'projeto',
  projeto: 'projeto',
  'cursos e certificacoes': 'curso',
  cursos: 'curso',
};

/** "Experiência" → "experiência", para "Adicionar experiência". Desconhecido → "item". */
export function singularOf(title: string): string {
  const key = title.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
  return SINGULAR[key] ?? 'item';
}

/** Experiência, formação, projetos, cursos: cartões com período e descrição. */
export function EntriesSection({ section, draft, organizing }: SectionBodyProps) {
  const [adding, setAdding] = useState(false);

  return (
    <>
      {section.items.length === 0 && !adding && <p className={styles.muted}>Nada aqui ainda.</p>}
      {section.items.length > 0 && (
        <ul className={styles.entries}>
          {section.items.map((item, index) => (
            <li key={item.id}>
              <EntryCard
                section={section}
                index={index}
                data={(draft.drafts[item.id] ?? item.data) as EntryItem}
                draft={draft}
                organizing={organizing}
              />
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <NewEntry section={section} onDone={() => setAdding(false)} />
      ) : (
        <Button
          variant="ghost"
          className={styles.add}
          icon={<Plus size={16} aria-hidden="true" />}
          onClick={() => setAdding(true)}
        >
          Adicionar {singularOf(section.title)}
        </Button>
      )}
    </>
  );
}

interface EntryCardProps {
  section: ResumeSectionDto;
  index: number;
  data: EntryItem;
  draft: SectionBodyProps['draft'];
  organizing: boolean;
}

function EntryCard({ section, index, data, draft, organizing }: EntryCardProps) {
  const item = section.items[index]!;
  const errors = draft.errors[item.id];
  const [editing, setEditing] = useState(Boolean(errors));
  // Item com erro depois de "Salvar" abre sozinho para mostrar o campo e
  // continua aberto quando o erro some.
  const [seenErrors, setSeenErrors] = useState(errors);
  if (errors !== seenErrors) {
    setSeenErrors(errors);
    if (errors) setEditing(true);
  }
  const dirty = draft.isDirty(item.id);
  const name = data.title.trim() || `item ${index + 1}`;
  const tools = organizing && (
    <ItemTools
      section={section}
      index={index}
      name={name}
      onDeleted={() => draft.discard([item.id])}
    />
  );

  if (editing) {
    return (
      <div className={styles.entry} data-dirty={dirty || undefined}>
        <EntryForm
          value={data}
          errors={errors}
          onChange={(next) => draft.edit(item.id, next)}
          footer={
            <>
              <Button onClick={() => setEditing(false)} disabled={Boolean(errors)}>
                Concluir
              </Button>
              <span className={styles.muted}>
                {dirty ? 'Fica no rascunho até você clicar em Salvar.' : 'Sem alterações.'}
              </span>
            </>
          }
        />
        {tools}
      </div>
    );
  }

  const shown = normalizeItem('entries', data) as EntryItem;
  const meta = [shown.organization, shown.location, formatPeriod(shown)].filter(Boolean);

  return (
    <article className={styles.entry} data-dirty={dirty || undefined} aria-label={name}>
      <div className={styles.entryHead}>
        <div className={styles.entryText}>
          <h3 className={styles.entryTitle}>
            {shown.title || 'Sem título'}
            {dirty && <span className={styles.unsaved}>não salvo</span>}
          </h3>
          {meta.length > 0 && <p className={styles.muted}>{meta.join(' · ')}</p>}
        </div>
        <div className={styles.entryActions}>
          <CopyButton text={itemText('entries', data)} what={name} />
          <button
            type="button"
            className={styles.textTool}
            aria-label={`Editar ${name}`}
            onClick={() => setEditing(true)}
          >
            <Pencil size={14} aria-hidden="true" />
            Editar
          </button>
        </div>
      </div>
      {shown.description && <p className={styles.description}>{shown.description}</p>}
      {tools}
    </article>
  );
}

function NewEntry({ section, onDone }: { section: ResumeSectionDto; onDone: () => void }) {
  const add = useAddItem();
  const toast = useToast();
  const [value, setValue] = useState<EntryItem>(emptyEntry);
  const [errors, setErrors] = useState<Record<string, string>>();

  function submit(event: FormEvent) {
    event.preventDefault();
    const found = validateItem('entries', value);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    add.mutate(
      { sectionId: section.id, data: normalizeItem('entries', value) },
      {
        onSuccess: () => {
          toast.show({ tone: 'success', message: `Adicionado em ${section.title}.` });
          onDone();
        },
        onError: (error) => toast.show({ tone: 'error', message: error.message }),
      },
    );
  }

  return (
    <form
      className={styles.entry}
      aria-label={`Adicionar ${singularOf(section.title)}`}
      noValidate
      onSubmit={submit}
    >
      <EntryForm
        value={value}
        errors={errors}
        onChange={(next) => {
          setValue(next);
          if (errors) setErrors(validateItem('entries', next));
        }}
        footer={
          <>
            <Button type="submit" variant="primary" disabled={add.isPending}>
              Adicionar
            </Button>
            <Button variant="ghost" onClick={onDone}>
              Cancelar
            </Button>
          </>
        }
      />
    </form>
  );
}

interface EntryFormProps {
  value: EntryItem;
  errors?: Record<string, string>;
  onChange: (next: EntryItem) => void;
  footer: ReactNode;
}

/** Campos de uma entrada. Datas no formato do schema (AAAA-MM). */
function EntryForm({ value, errors, onChange, footer }: EntryFormProps) {
  const set = (patch: Partial<EntryItem>) => onChange({ ...value, ...patch });

  return (
    <div className={styles.entryForm}>
      <div className={styles.wide}>
        <Field
          label="Título"
          required
          error={errors?.title}
          hint="Cargo, curso ou nome do projeto."
        >
          <input value={value.title} onChange={(event) => set({ title: event.target.value })} />
        </Field>
      </div>
      <Field label="Organização" error={errors?.organization}>
        <input
          value={value.organization ?? ''}
          onChange={(event) => set({ organization: event.target.value })}
        />
      </Field>
      <Field label="Local" error={errors?.location}>
        <input
          value={value.location ?? ''}
          placeholder="Ex.: Remoto, Campinas/SP"
          onChange={(event) => set({ location: event.target.value })}
        />
      </Field>
      <Field label="Início" error={errors?.startDate} hint="Mês e ano.">
        <input
          type="month"
          value={value.startDate ?? ''}
          placeholder="AAAA-MM"
          onChange={(event) => set({ startDate: event.target.value || null })}
        />
      </Field>
      <Field label="Fim" error={errors?.endDate} hint={value.current ? 'Item atual.' : undefined}>
        <input
          type="month"
          value={value.endDate ?? ''}
          placeholder="AAAA-MM"
          disabled={value.current}
          onChange={(event) => set({ endDate: event.target.value || null })}
        />
      </Field>
      <label className={`${styles.check} ${styles.wide}`}>
        <input
          type="checkbox"
          checked={value.current}
          onChange={(event) =>
            set({
              current: event.target.checked,
              endDate: event.target.checked ? null : value.endDate,
            })
          }
        />
        Ainda estou aqui (sem data de fim)
      </label>
      <div className={styles.wide}>
        <Field label="Descrição" error={errors?.description}>
          <textarea
            rows={4}
            value={value.description ?? ''}
            placeholder="O que você fez, com resultado e tecnologia."
            onChange={(event) => set({ description: event.target.value })}
          />
        </Field>
      </div>
      <div className={`${styles.formFooter} ${styles.wide}`}>{footer}</div>
    </div>
  );
}
