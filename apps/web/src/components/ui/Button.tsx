import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Ícone antes do texto (já com `aria-hidden`). */
  icon?: ReactNode;
}

export function Button({
  variant = 'secondary',
  icon,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[styles.button, styles[variant], className].filter(Boolean).join(' ')}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
