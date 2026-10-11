import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}

/** Área tracejada para "nada aqui ainda", com o que fazer. */
export function EmptyState({ icon, title, children }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      {icon && <div className={styles.icon}>{icon}</div>}
      <h2 className={styles.title}>{title}</h2>
      {children && <div className={styles.body}>{children}</div>}
    </div>
  );
}
