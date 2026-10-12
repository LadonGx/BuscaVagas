import { X } from 'lucide-react';
import { useId, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import styles from './Preferencias.module.css';

interface ToggleGroupProps<T extends string> {
  legend: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T[];
  onChange: (next: T[]) => void;
}

/** Botões liga/desliga. Nenhum ligado = critério desligado. */
export function ToggleGroup<T extends string>({
  legend,
  options,
  labels,
  value,
  onChange,
}: ToggleGroupProps<T>) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.toggles}>
        {options.map((option) => {
          const on = value.includes(option);
          return (
            <button
              key={option}
              type="button"
              className={styles.toggle}
              aria-pressed={on}
              onClick={() =>
                onChange(on ? value.filter((item) => item !== option) : [...value, option])
              }
            >
              {labels[option]}
            </button>
          );
        })}
      </div>
      {value.length === 0 && <p className={styles.hint}>Nenhum marcado: critério desligado.</p>}
    </fieldset>
  );
}

interface ChipListProps {
  label: string;
  hint: string;
  values: string[];
  onChange: (next: string[]) => void;
  max: number;
  maxLength: number;
  placeholder: string;
  error?: string;
}

/** Lista de textos (cidades, empresas): Enter ou vírgula adiciona; colar com vírgulas separa. */
export function ChipList({
  label,
  hint,
  values,
  onChange,
  max,
  maxLength,
  placeholder,
  error,
}: ChipListProps) {
  const id = useId();
  const [text, setText] = useState('');
  const full = values.length >= max;

  function add(raw: string[]) {
    const next = [...values];
    const seen = new Set(values.map((item) => item.toLocaleLowerCase('pt-BR')));
    for (const piece of raw) {
      const item = piece.trim().slice(0, maxLength);
      const key = item.toLocaleLowerCase('pt-BR');
      if (!item || seen.has(key) || next.length >= max) continue;
      seen.add(key);
      next.push(item);
    }
    if (next.length !== values.length) onChange(next);
    setText('');
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      add([text]);
    } else if (event.key === 'Backspace' && !text && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text');
    if (!pasted.includes(',') && !pasted.includes('\n')) return;
    event.preventDefault();
    add(pasted.split(/[,\n]/));
  }

  return (
    <div className={styles.fieldset}>
      <label htmlFor={id} className={styles.legend}>
        {label}
      </label>
      <ul className={styles.chips} aria-label={label}>
        {values.map((item) => (
          <li key={item} className={styles.textChip}>
            {item}
            <button
              type="button"
              className={styles.chipRemove}
              aria-label={`Tirar ${item}`}
              onClick={() => onChange(values.filter((value) => value !== item))}
            >
              <X size={13} aria-hidden="true" />
            </button>
          </li>
        ))}
        <li className={styles.addItem}>
          <input
            id={id}
            className={styles.chipInput}
            value={text}
            disabled={full}
            maxLength={maxLength}
            placeholder={full ? `Máximo de ${max}` : placeholder}
            aria-describedby={`${id}-dica`}
            aria-invalid={error ? true : undefined}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onBlur={() => text.trim() && add([text])}
          />
        </li>
      </ul>
      <p id={`${id}-dica`} className={error ? styles.error : styles.hint}>
        {error ?? hint}
      </p>
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  hint: string;
  value: string;
  onChange: (next: string) => void;
  prefix?: string;
  suffix?: string;
  min: number;
  max: number;
  placeholder?: string;
  error?: string;
}

/** Número opcional: vazio desliga o critério. */
export function NumberField({
  label,
  hint,
  value,
  onChange,
  prefix,
  suffix,
  min,
  max,
  placeholder,
  error,
}: NumberFieldProps) {
  const id = useId();
  return (
    <div className={styles.fieldset}>
      <label htmlFor={id} className={styles.legend}>
        {label}
      </label>
      <span className={styles.affix} data-invalid={error ? true : undefined}>
        {prefix && <span aria-hidden="true">{prefix}</span>}
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={value}
          placeholder={placeholder}
          aria-describedby={`${id}-dica`}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix && <span aria-hidden="true">{suffix}</span>}
      </span>
      <p id={`${id}-dica`} className={error ? styles.error : styles.hint}>
        {error ?? hint}
      </p>
    </div>
  );
}
