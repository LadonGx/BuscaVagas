import type { StackOptionDto } from '@busca-vagas/shared';
import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { formatNumber } from '../../lib/format';
import styles from './Preferencias.module.css';

/** Quantas sugestões aparecem de uma vez (a lista rola). */
const MAX_SHOWN = 50;

const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();

/**
 * Sugestões para o texto digitado: quem começa com o texto vem antes, depois
 * quem só contém; dentro de cada grupo, pela quantidade de vagas. Tira as
 * que já estão no próprio grupo.
 */
export function suggestStacks(
  options: readonly StackOptionDto[],
  text: string,
  exclude: readonly string[],
): StackOptionDto[] {
  const query = plain(text);
  const skip = new Set(exclude);
  const pool = options.filter((option) => !skip.has(option.name));
  if (!query) return pool.slice(0, MAX_SHOWN);

  const starts: StackOptionDto[] = [];
  const contains: StackOptionDto[] = [];
  for (const option of pool) {
    const name = plain(option.name);
    if (name.startsWith(query)) starts.push(option);
    else if (name.includes(query)) contains.push(option);
  }
  return [...starts, ...contains].slice(0, MAX_SHOWN);
}

interface StackComboboxProps {
  /** Nome do campo para o leitor de tela ("Adicionar em Principais"). */
  label: string;
  options: readonly StackOptionDto[];
  /** Tecnologias deste grupo (não aparecem na lista). */
  current: readonly string[];
  /** Em qual outro grupo cada tecnologia já está ("Evitar"). */
  placedIn: (tech: string) => string | null;
  disabled?: boolean;
  placeholder: string;
  invalid?: boolean;
  describedBy?: string;
  /** Adiciona; devolve `false` se o texto não serviu (aí o campo fica como está). */
  onPick: (raw: string) => boolean;
}

/**
 * Campo com lista de sugestões própria (a lista nativa do navegador não
 * segue o tema e, no Windows, abre fora do lugar). ↑/↓ escolhem, Enter
 * adiciona o destacado — ou o que foi digitado —, Esc fecha.
 */
export function StackCombobox({
  label,
  options,
  current,
  placedIn,
  disabled,
  placeholder,
  invalid,
  describedBy,
  onPick,
}: StackComboboxProps) {
  const listId = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const suggestions = open ? suggestStacks(options, text, current) : [];
  const expanded = open && suggestions.length > 0;
  const optionId = (index: number) => `${listId}-${index}`;

  useEffect(() => {
    if (active < 0) return;
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' });
  });

  function pick(raw: string) {
    if (!onPick(raw)) return;
    setText('');
    setActive(-1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) setOpen(true);
        setActive((index) => Math.min(index + 1, suggestions.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive((index) => Math.max(index - 1, -1));
        break;
      case 'Enter':
      case ',': {
        event.preventDefault();
        const chosen = expanded && active >= 0 ? suggestions[active] : undefined;
        pick(chosen ? chosen.name : text);
        break;
      }
      case 'Escape':
        if (expanded) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          setActive(-1);
        }
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  }

  return (
    <div className={styles.combo}>
      <input
        className={styles.chipInput}
        role="combobox"
        aria-label={label}
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        value={text}
        disabled={disabled}
        maxLength={40}
        placeholder={placeholder}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label={`Sugestões: ${label}`}
        className={styles.listbox}
        hidden={!expanded}
      >
        {suggestions.map((option, index) => {
          const where = placedIn(option.name);
          return (
            <li
              key={option.name}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              className={styles.option}
              // Mantém o foco no campo: o clique escolhe sem fechar antes.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => pick(option.name)}
            >
              <span className={styles.optionName}>{option.name}</span>
              {where && <span className={styles.optionWhere}>já em {where}</span>}
              {!option.known && <span className={styles.optionWhere}>não reconhecida</span>}
              <span className={styles.optionCount}>
                {formatNumber(option.jobs)} {option.jobs === 1 ? 'vaga' : 'vagas'}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
