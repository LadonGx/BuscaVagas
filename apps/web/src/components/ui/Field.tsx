import { useId, type ReactElement, type ReactNode } from 'react';
import { cloneElement } from 'react';
import styles from './Field.module.css';

interface FieldProps {
  label: string;
  /** Mensagem de erro do campo (aparece embaixo e é ligada ao input). */
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  /** Um único input/select/textarea; recebe id e aria-* daqui. */
  children: ReactElement<Record<string, unknown>>;
}

/** Rótulo + campo + dica/erro, com os atributos de acessibilidade ligados. */
export function Field({ label, error, hint, required, children }: FieldProps) {
  const id = useId();
  const messageId = `${id}-msg`;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {cloneElement(children, {
        id,
        required,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error || hint ? messageId : undefined,
        className: [styles.control, children.props.className].filter(Boolean).join(' '),
      })}
      {(error || hint) && (
        <span id={messageId} className={error ? styles.error : styles.hint}>
          {error ?? hint}
        </span>
      )}
    </div>
  );
}
