import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router';
import { Button } from './ui/Button';
import { Drawer } from './ui/Drawer';
import styles from './UnsavedChanges.module.css';

/**
 * Formulário com rascunho (Currículo, Preferências): pergunta antes de sair
 * da tela, o navegador pergunta antes de fechar a aba, e `Ctrl+S` salva —
 * inclusive com o cursor dentro de um campo.
 *
 * `save` devolve `true` quando tudo foi salvo (aí "Salvar e sair" segue).
 */
export function useUnsavedChanges({
  count,
  saving,
  save,
}: {
  /** Quantas alterações não salvas (0 = nada a perguntar). */
  count: number;
  saving: boolean;
  save: () => Promise<boolean>;
}) {
  const dirty = count > 0;
  /** Navegação que já tratou o rascunho (ex.: salvou antes de abrir o PDF). */
  const allowLeave = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !allowLeave.current && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 's') {
        return;
      }
      event.preventDefault();
      void saveRef.current();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return {
    /** Libera a próxima navegação (o rascunho já foi tratado). */
    allowNextLeave: () => {
      allowLeave.current = true;
    },
    dialog: (
      <Drawer
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        placement="center"
        title="Sair sem salvar?"
        footer={
          <>
            <Button
              variant="primary"
              disabled={saving}
              onClick={async () => {
                if (await save()) blocker.proceed?.();
                else blocker.reset?.();
              }}
            >
              Salvar e sair
            </Button>
            <Button onClick={() => blocker.proceed?.()}>Sair sem salvar</Button>
            <Button variant="ghost" onClick={() => blocker.reset?.()}>
              Continuar editando
            </Button>
          </>
        }
      >
        <p className={styles.text}>
          {count === 1
            ? '1 alteração ainda não foi salva e vai se perder.'
            : `${count} alterações ainda não foram salvas e vão se perder.`}
        </p>
      </Drawer>
    ),
  };
}

/** "1 alteração não salva" / "3 alterações não salvas". */
export function unsavedLabel(count: number): string {
  return count === 1 ? '1 alteração não salva' : `${count} alterações não salvas`;
}
