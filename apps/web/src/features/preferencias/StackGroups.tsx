import { normalizeStack, type StackOptionDto } from '@busca-vagas/shared';
import { FileText, X } from 'lucide-react';
import { useId, useState } from 'react';
import { useStackOptions } from '../../api/preferences';
import { Button } from '../../components/ui/Button';
import {
  moveStack,
  STACK_FIELDS,
  type FormErrors,
  type PreferencesForm,
  type StackField,
} from './form';
import { ImportFromResume } from './ImportFromResume';
import { StackCombobox } from './StackCombobox';
import styles from './Preferencias.module.css';

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

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

interface StackGroupsProps {
  form: PreferencesForm;
  errors: FormErrors;
  onChange: (next: PreferencesForm) => void;
}

/** As três listas de tecnologias. A mesma tecnologia fica num grupo só. */
export function StackGroups({ form, errors, onChange }: StackGroupsProps) {
  const { data: options = [] } = useStackOptions();
  const titleId = useId();
  const [status, setStatus] = useState('');
  const [importing, setImporting] = useState(false);
  const known =
    options.length > 0 ? new Set(options.filter((o) => o.known).map((o) => o.name)) : null;

  const fieldOf = (tech: string): StackField | null =>
    STACK_FIELDS.find((field) => form[field].includes(tech)) ?? null;
  const placedIn = (tech: string) => {
    const field = fieldOf(tech);
    return field ? labelOf(field) : null;
  };

  function add(field: StackField, raw: string): boolean {
    const [tech] = normalizeStack([raw]);
    if (!tech) return false;
    if (form[field].includes(tech)) {
      setStatus(`"${tech}" já está em ${labelOf(field)}.`);
      return true;
    }
    const result = moveStack(form, tech, field);
    onChange(result.form);
    setStatus(
      result.from
        ? `"${tech}" foi para ${labelOf(field)} e saiu de ${labelOf(result.from)}.`
        : `"${tech}" entrou em ${labelOf(field)}.`,
    );
    return true;
  }

  function addMany(techs: string[], field: StackField) {
    let next = form;
    let moved = 0;
    const added = techs.filter((tech) => !form[field].includes(tech));
    for (const tech of added) {
      const result = moveStack(next, tech, field);
      if (result.from) moved += 1;
      next = result.form;
    }
    onChange(next);
    setImporting(false);
    setStatus(
      `${plural(added.length, 'tecnologia do currículo foi', 'tecnologias do currículo foram')} para ${labelOf(field)}` +
        (moved > 0 ? ` (${plural(moved, 'saiu', 'saíram')} de outro grupo).` : '.') +
        ' Salve para valer.',
    );
  }

  return (
    <section className={styles.card} aria-labelledby={titleId}>
      <div className={styles.cardHead}>
        <h2 id={titleId} className={styles.cardTitle}>
          Stacks
        </h2>
        {!importing && (
          <Button
            variant="ghost"
            icon={<FileText size={16} aria-hidden="true" />}
            onClick={() => setImporting(true)}
          >
            Trazer do currículo
          </Button>
        )}
      </div>

      {importing && (
        <ImportFromResume placedIn={placedIn} onAdd={addMany} onClose={() => setImporting(false)} />
      )}

      {STACK_GROUPS.map((group) => (
        <StackGroup
          key={group.field}
          group={group}
          items={form[group.field]}
          options={options}
          known={known}
          placedIn={placedIn}
          error={errors[group.field]}
          onAdd={(raw) => add(group.field, raw)}
          onRemove={(tech) =>
            onChange({ ...form, [group.field]: form[group.field].filter((t) => t !== tech) })
          }
        />
      ))}

      <p className={styles.hint} role="status">
        {status}
      </p>
    </section>
  );
}

interface StackGroupProps {
  group: (typeof STACK_GROUPS)[number];
  items: string[];
  options: readonly StackOptionDto[];
  known: Set<string> | null;
  placedIn: (tech: string) => string | null;
  error?: string;
  onAdd: (raw: string) => boolean;
  onRemove: (tech: string) => void;
}

function StackGroup({
  group,
  items,
  options,
  known,
  placedIn,
  error,
  onAdd,
  onRemove,
}: StackGroupProps) {
  const id = useId();
  const full = items.length >= MAX_PER_GROUP;
  const unknown = known ? items.filter((tech) => !known.has(tech)) : [];

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
          <StackCombobox
            label={`Adicionar em ${group.label}`}
            options={options}
            current={items}
            placedIn={(tech) => {
              const where = placedIn(tech);
              return where === group.label ? null : where;
            }}
            disabled={full}
            invalid={Boolean(error)}
            describedBy={error ? `${id}-erro` : undefined}
            placeholder={
              full ? `Máximo de ${MAX_PER_GROUP}` : '+ adicionar (react native, docker…)'
            }
            onPick={onAdd}
          />
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
