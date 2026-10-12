import { normalizeStack, type StackOptionDto } from '@busca-vagas/shared';
import { X } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';
import { useStackOptions } from '../../api/preferences';
import { moveStack, type FormErrors, type PreferencesForm, type StackField } from './form';
import styles from './Preferencias.module.css';

/** Até quantas sugestões vão para a lista do campo. */
const MAX_SUGGESTIONS = 200;
const MAX_PER_GROUP = 30;

export const STACK_GROUPS: { field: StackField; label: string; hint: string }[] = [
  {
    field: 'stacksCore',
    label: 'Principais',
    hint: 'Até 3 encontradas já dão a nota cheia do critério.',
  },
  { field: 'stacksPlus', label: 'Ganham pontos', hint: 'Somam pontos quando aparecem na vaga.' },
  {
    field: 'stacksAvoid',
    label: 'Evitar',
    hint: 'No título, a vaga fica incompatível; só na descrição, a nota cai.',
  },
];

const labelOf = (field: StackField) => STACK_GROUPS.find((group) => group.field === field)!.label;

interface StackGroupsProps {
  form: PreferencesForm;
  errors: FormErrors;
  onChange: (next: PreferencesForm) => void;
}

/** As três listas de tecnologias. A mesma tecnologia fica num grupo só. */
export function StackGroups({ form, errors, onChange }: StackGroupsProps) {
  const { data: options } = useStackOptions();
  const listId = useId();
  const [moved, setMoved] = useState('');
  const known = options ? new Set(options.filter((o) => o.known).map((o) => o.name)) : null;

  function add(field: StackField, raw: string): boolean {
    const [tech] = normalizeStack([raw]);
    if (!tech) return false;
    if (form[field].includes(tech)) {
      setMoved(`"${tech}" já está em ${labelOf(field)}.`);
      return true;
    }
    const result = moveStack(form, tech, field);
    onChange(result.form);
    setMoved(
      result.from
        ? `"${tech}" foi para ${labelOf(field)} e saiu de ${labelOf(result.from)}.`
        : `"${tech}" entrou em ${labelOf(field)}.`,
    );
    return true;
  }

  return (
    <section className={styles.card} aria-labelledby={`${listId}-titulo`}>
      <h2 id={`${listId}-titulo`} className={styles.cardTitle}>
        Stacks
      </h2>
      <datalist id={listId}>
        {options?.slice(0, MAX_SUGGESTIONS).map((option) => (
          <option key={option.name} value={option.name}>
            {suggestionLabel(option)}
          </option>
        ))}
      </datalist>

      {STACK_GROUPS.map((group) => (
        <StackGroup
          key={group.field}
          group={group}
          items={form[group.field]}
          known={known}
          listId={listId}
          error={errors[group.field]}
          onAdd={(raw) => add(group.field, raw)}
          onRemove={(tech) =>
            onChange({ ...form, [group.field]: form[group.field].filter((t) => t !== tech) })
          }
        />
      ))}

      <p className={styles.hint} role="status">
        {moved}
      </p>
    </section>
  );
}

function suggestionLabel(option: StackOptionDto): string {
  const jobs = option.jobs === 1 ? '1 vaga' : `${option.jobs} vagas`;
  return option.known ? jobs : `${jobs} · o detector não conhece`;
}

interface StackGroupProps {
  group: (typeof STACK_GROUPS)[number];
  items: string[];
  known: Set<string> | null;
  listId: string;
  error?: string;
  onAdd: (raw: string) => boolean;
  onRemove: (tech: string) => void;
}

function StackGroup({ group, items, known, listId, error, onAdd, onRemove }: StackGroupProps) {
  const id = useId();
  const [text, setText] = useState('');
  const full = items.length >= MAX_PER_GROUP;
  const unknown = known ? items.filter((tech) => !known.has(tech)) : [];

  function submit() {
    if (onAdd(text)) setText('');
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className={styles.group} data-tone={group.field}>
      <div className={styles.groupHead}>
        <span id={`${id}-nome`} className={styles.groupLabel}>
          {group.label}
        </span>
        <span className={styles.hint}>{group.hint}</span>
      </div>
      <ul className={styles.chips} aria-labelledby={`${id}-nome`}>
        {items.map((tech) => (
          <li
            key={tech}
            className={styles.stackChip}
            data-unknown={known && !known.has(tech) ? true : undefined}
          >
            {tech}
            <button
              type="button"
              className={styles.chipRemove}
              aria-label={`Tirar ${tech} de ${group.label}`}
              onClick={() => onRemove(tech)}
            >
              <X size={13} aria-hidden="true" />
            </button>
          </li>
        ))}
        <li className={styles.addItem}>
          <input
            className={styles.chipInput}
            list={listId}
            value={text}
            disabled={full}
            maxLength={40}
            aria-label={`Adicionar em ${group.label}`}
            aria-describedby={error ? `${id}-erro` : undefined}
            aria-invalid={error ? true : undefined}
            placeholder={
              full ? `Máximo de ${MAX_PER_GROUP}` : '+ adicionar (react native, docker…)'
            }
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
          />
          {text.trim() && (
            <button type="button" className={styles.smallButton} onClick={submit}>
              Adicionar
            </button>
          )}
        </li>
      </ul>
      {unknown.length > 0 && (
        <p className={styles.warn}>
          O detector ainda não conhece {unknown.join(', ')}: nenhuma vaga vai citar{' '}
          {unknown.length === 1 ? 'esse nome' : 'esses nomes'} por enquanto.
        </p>
      )}
      {error && (
        <p id={`${id}-erro`} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
