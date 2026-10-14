import { DEFAULT_NOTIFY_MIN_SCORE, type NotificationSettingsDto } from '@busca-vagas/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router';
import { useNotificationSettings, useSaveNotificationSettings } from '../../api/notifications';
import { useToast } from '../../components/toast/toast-context';
import { Button } from '../../components/ui/Button';
import styles from './Preferencias.module.css';

/**
 * "Avisos": nota mínima para o sino avisar (docs/features/16-notifications.md).
 * Salva sozinho, fora do formulário de preferências: não recalcula as notas.
 */
export function NotificationsCard() {
  const { data, isError, error } = useNotificationSettings();
  const { hash } = useLocation();
  const card = useRef<HTMLElement>(null);

  // Veio do sino ("Mudar a nota"): rola até aqui.
  useEffect(() => {
    if (hash === '#avisos' && data) card.current?.scrollIntoView?.({ block: 'center' });
  }, [hash, data]);

  return (
    <section ref={card} id="avisos" className={styles.card} aria-labelledby="avisos-titulo">
      <h2 id="avisos-titulo" className={styles.cardTitle}>
        Aviso de nota alta
      </h2>
      {isError && <p className={styles.error}>{error.message}</p>}
      {data && <NotificationsForm key={data.minScore} saved={data} />}
    </section>
  );
}

function NotificationsForm({ saved }: { saved: NotificationSettingsDto }) {
  const save = useSaveNotificationSettings();
  const toast = useToast();
  const [on, setOn] = useState(saved.minScore > 0);
  const [score, setScore] = useState(String(saved.minScore || DEFAULT_NOTIFY_MIN_SCORE));
  const value = Number(score);
  const invalid = on && (!Number.isInteger(value) || value < 1 || value > 1000);
  const next = on ? value : 0;
  const dirty = !invalid && next !== saved.minScore;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!dirty) return;
    save.mutate(
      { minScore: next },
      {
        onSuccess: () =>
          toast.show({
            tone: 'success',
            message: next ? `Avisos a partir da nota ${next}.` : 'Avisos desligados.',
          }),
        onError: (failure) => toast.show({ tone: 'error', message: failure.message }),
      },
    );
  }

  return (
    // noValidate: a validação é a nossa (1 a 1000, qualquer inteiro; o `step`
    // é só para as setinhas andarem de 50 em 50).
    <form onSubmit={submit} className={styles.fieldset} noValidate>
      <label className={styles.check}>
        <input type="checkbox" checked={on} onChange={(event) => setOn(event.target.checked)} />
        Avisar no sino quando chegar vaga nova com nota alta
      </label>
      {on && (
        <label className={styles.text}>
          Nota mínima
          <span className={styles.affix} data-invalid={invalid || undefined}>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={1000}
              step={50}
              value={score}
              aria-invalid={invalid || undefined}
              onChange={(event) => setScore(event.target.value)}
            />
            de 1000
          </span>
        </label>
      )}
      {invalid && <p className={styles.error}>Use um número inteiro de 1 a 1000.</p>}
      <p className={styles.hint}>
        Um aviso por busca, com as vagas que entraram nas últimas 48 h. Incompatíveis e encerradas
        não avisam.
      </p>
      <div className={styles.buttons}>
        <Button type="submit" disabled={!dirty || save.isPending}>
          {save.isPending ? 'Salvando…' : 'Salvar avisos'}
        </Button>
      </div>
    </form>
  );
}
