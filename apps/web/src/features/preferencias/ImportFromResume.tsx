import { useState } from 'react';
import { Link } from 'react-router';
import { useResumeStacks } from '../../api/resume';
import { Button } from '../../components/ui/Button';
import type { StackField } from './form';
import styles from './Preferencias.module.css';

interface ImportFromResumeProps {
  /** Em qual grupo a tecnologia já está, pelo nome do grupo. */
  placedIn: (tech: string) => string | null;
  onAdd: (techs: string[], field: StackField) => void;
  onClose: () => void;
}

/**
 * "Trazer do currículo": as tecnologias das Competências, para marcar e
 * mandar para Principais ou Ganham pontos. Vai para o rascunho, como o resto.
 */
export function ImportFromResume({ placedIn, onAdd, onClose }: ImportFromResumeProps) {
  const { data, isPending, isError, error } = useResumeStacks(true);
  // Marcadas por padrão: as que ainda não estão em nenhum grupo.
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [checkedPlaced, setCheckedPlaced] = useState<Set<string>>(new Set());

  const stacks = data?.stacks ?? [];
  const isChecked = (name: string) =>
    placedIn(name) ? checkedPlaced.has(name) : !unchecked.has(name);
  const chosen = stacks.map((stack) => stack.name).filter(isChecked);

  function toggle(name: string, on: boolean) {
    const update = (set: Set<string>, add: boolean) => {
      const next = new Set(set);
      if (add) next.add(name);
      else next.delete(name);
      return next;
    };
    if (placedIn(name)) setCheckedPlaced((set) => update(set, on));
    else setUnchecked((set) => update(set, !on));
  }

  return (
    <div className={styles.importPanel} role="group" aria-labelledby="trazer-titulo">
      <p id="trazer-titulo" className={styles.importTitle}>
        Tecnologias do currículo
        {data && data.scannedSections.length > 0 && (
          <span className={styles.hint}> · procurei em {data.scannedSections.join(', ')}</span>
        )}
      </p>

      {isPending && <p className={styles.hint}>Lendo o currículo…</p>}
      {isError && <p className={styles.error}>{error.message}</p>}
      {data && stacks.length === 0 && (
        <p className={styles.hint}>
          Nenhuma tecnologia reconhecida. Preencha a seção Competências no{' '}
          <Link to="/curriculo">Currículo</Link> (ex.: "TypeScript, React, PostgreSQL").
        </p>
      )}

      {stacks.length > 0 && (
        <ul className={styles.importList}>
          {stacks.map((stack) => {
            const where = placedIn(stack.name);
            return (
              <li key={stack.name}>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={isChecked(stack.name)}
                    onChange={(event) => toggle(stack.name, event.target.checked)}
                  />
                  <span className={styles.importName}>{stack.name}</span>
                  {where && <span className={styles.optionWhere}>já em {where}</span>}
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className={styles.buttons}>
        {stacks.length > 0 && (
          <>
            <Button
              variant="primary"
              disabled={chosen.length === 0}
              onClick={() => onAdd(chosen, 'stacksCore')}
            >
              Adicionar marcadas em Principais
            </Button>
            <Button disabled={chosen.length === 0} onClick={() => onAdd(chosen, 'stacksPlus')}>
              Adicionar marcadas em Ganham pontos
            </Button>
          </>
        )}
        <Button variant="ghost" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </div>
  );
}
