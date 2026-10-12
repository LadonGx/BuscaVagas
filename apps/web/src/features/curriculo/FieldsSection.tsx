import type { FieldItem, ResumeSectionDto } from '@busca-vagas/shared';
import { Plus } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { useAddItem } from '../../api/resume';
import { useToast } from '../../components/toast/toast-context';
import { Button } from '../../components/ui/Button';
import { CopyButton } from '../../components/ui/CopyButton';
import { validateItem } from './draft';
import { ItemTools } from './ItemTools';
import type { ResumeDraft } from './useResumeDraft';
import styles from './Section.module.css';

interface SectionBodyProps {
  section: ResumeSectionDto;
  draft: ResumeDraft;
  organizing: boolean;
}

/** Rótulo + valor em duas colunas; "Copiar" copia só o valor. */
export function FieldsSection({ section, draft, organizing }: SectionBodyProps) {
  return (
    <>
      {section.items.length === 0 ? (
        <p className={styles.muted}>Nenhum campo ainda.</p>
      ) : (
        <div className={styles.fieldGrid}>
          {section.items.map((item, index) => (
            <FieldRow
              key={item.id}
              section={section}
              index={index}
              data={(draft.drafts[item.id] ?? item.data) as FieldItem}
              draft={draft}
              organizing={organizing}
            />
          ))}
        </div>
      )}
      <AddField section={section} />
    </>
  );
}

interface FieldRowProps {
  section: ResumeSectionDto;
  index: number;
  data: FieldItem;
  draft: ResumeDraft;
  organizing: boolean;
}

function FieldRow({ section, index, data, draft, organizing }: FieldRowProps) {
  const id = useId();
  const item = section.items[index]!;
  const errors = draft.errors[item.id];
  const error = errors?.label ?? errors?.value;
  const dirty = draft.isDirty(item.id);
  const name = data.label.trim() || `campo ${index + 1}`;

  return (
    <div className={styles.field} data-dirty={dirty || undefined}>
      {organizing ? (
        <input
          className={styles.labelInput}
          aria-label={`Rótulo de ${name}`}
          value={data.label}
          aria-invalid={errors?.label ? true : undefined}
          onChange={(event) => draft.edit(item.id, { ...data, label: event.target.value })}
        />
      ) : (
        <label htmlFor={id} className={styles.fieldLabel}>
          {data.label}
          {dirty && (
            <>
              <span className={styles.dot} aria-hidden="true" />{' '}
              <span className="sr-only">(não salvo)</span>
            </>
          )}
        </label>
      )}
      <div className={styles.valueRow}>
        <textarea
          id={id}
          rows={1}
          className={styles.value}
          value={data.value}
          aria-label={organizing ? `Valor de ${name}` : undefined}
          aria-invalid={errors?.value ? true : undefined}
          aria-describedby={error ? `${id}-erro` : undefined}
          onChange={(event) => draft.edit(item.id, { ...data, value: event.target.value })}
        />
        <CopyButton text={data.value.trim()} what={name} />
      </div>
      {error && (
        <span id={`${id}-erro`} className={styles.error}>
          {error}
        </span>
      )}
      {organizing && (
        <ItemTools
          section={section}
          index={index}
          name={name}
          onDeleted={() => draft.discard([item.id])}
        />
      )}
    </div>
  );
}

function AddField({ section }: { section: ResumeSectionDto }) {
  const add = useAddItem();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string>();

  function submit(event: FormEvent) {
    event.preventDefault();
    const data = { label, value: '' };
    const errors = validateItem('fields', data);
    if (errors.label) {
      setError(errors.label);
      return;
    }
    add.mutate(
      { sectionId: section.id, data: { label: label.trim(), value: '' } },
      {
        onSuccess: () => {
          setOpen(false);
          setLabel('');
          setError(undefined);
        },
        onError: (apiError) => toast.show({ tone: 'error', message: apiError.message }),
      },
    );
  }

  if (!open) {
    return (
      <Button
        variant="ghost"
        className={styles.add}
        icon={<Plus size={16} aria-hidden="true" />}
        onClick={() => setOpen(true)}
      >
        Adicionar campo
      </Button>
    );
  }

  return (
    <form className={styles.addForm} onSubmit={submit}>
      <input
        className={styles.input}
        aria-label={`Nome do novo campo em ${section.title}`}
        placeholder="Ex.: Pretensão salarial (PJ)"
        value={label}
        maxLength={80}
        autoFocus
        aria-invalid={error ? true : undefined}
        onChange={(event) => {
          setLabel(event.target.value);
          setError(undefined);
        }}
      />
      <Button type="submit" variant="primary" disabled={add.isPending}>
        Adicionar
      </Button>
      <Button variant="ghost" onClick={() => setOpen(false)}>
        Cancelar
      </Button>
      {error && <span className={styles.error}>{error}</span>}
    </form>
  );
}

export type { SectionBodyProps };
