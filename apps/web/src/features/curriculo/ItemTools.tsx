import type { ResumeSectionDto } from '@busca-vagas/shared';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useDeleteItem, useReorderItems } from '../../api/resume';
import { useToast } from '../../components/toast/toast-context';
import styles from './Section.module.css';

/** Lista com dois itens trocados de lugar (para subir/descer). */
export function swapped(ids: readonly string[], index: number, delta: -1 | 1): string[] {
  const next = [...ids];
  const target = index + delta;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

interface ConfirmDeleteProps {
  /** Do que é, para o leitor de tela: "Apagar {name}". */
  name: string;
  onConfirm: () => void;
  disabled?: boolean;
  /** Texto visível. Sem texto, o botão é só o ícone. */
  children?: ReactNode;
}

/** Apagar em dois cliques: o primeiro arma, o segundo (em até 5 s) apaga. */
export function ConfirmDelete({ name, onConfirm, disabled, children }: ConfirmDeleteProps) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 5_000);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <button
      type="button"
      className={children ? styles.textTool : styles.tool}
      data-armed={armed || undefined}
      disabled={disabled}
      aria-label={armed ? `Clique de novo para apagar ${name}` : `Apagar ${name}`}
      title={armed ? 'Clique de novo para apagar' : 'Apagar'}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
    >
      <Trash2 size={15} aria-hidden="true" />
      {armed ? 'Confirmar' : children}
    </button>
  );
}

interface ItemToolsProps {
  section: ResumeSectionDto;
  index: number;
  name: string;
  /** Depois de apagar: tira o item do rascunho. */
  onDeleted: () => void;
}

/** Subir, descer e apagar um item (modo "Organizar"). Vai para a API na hora. */
export function ItemTools({ section, index, name, onDeleted }: ItemToolsProps) {
  const reorder = useReorderItems();
  const remove = useDeleteItem();
  const toast = useToast();
  const item = section.items[index]!;
  const ids = section.items.map((entry) => entry.id);
  const showError = (error: Error) => toast.show({ tone: 'error', message: error.message });

  function move(delta: -1 | 1) {
    reorder.mutate(
      { sectionId: section.id, ids: swapped(ids, index, delta) },
      { onError: showError },
    );
  }

  return (
    <div className={styles.tools} role="group" aria-label={`Organizar ${name}`}>
      <button
        type="button"
        className={styles.tool}
        aria-label={`Subir ${name}`}
        title="Subir"
        disabled={index === 0}
        onClick={() => move(-1)}
      >
        <ArrowUp size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={styles.tool}
        aria-label={`Descer ${name}`}
        title="Descer"
        disabled={index === ids.length - 1}
        onClick={() => move(1)}
      >
        <ArrowDown size={15} aria-hidden="true" />
      </button>
      <ConfirmDelete
        name={name}
        disabled={remove.isPending}
        onConfirm={() =>
          remove.mutate(item.id, {
            onSuccess: () => {
              onDeleted();
              toast.show({ message: `"${name}" apagado.` });
            },
            onError: showError,
          })
        }
      />
    </div>
  );
}
