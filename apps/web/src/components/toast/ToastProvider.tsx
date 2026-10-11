import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ToastContext, type ToastApi, type ToastOptions } from './toast-context';
import styles from './Toast.module.css';

interface ToastItem extends ToastOptions {
  id: number;
}

const MAX_VISIBLE = 4;

function defaultDuration(options: ToastOptions): number {
  if (options.duration) return options.duration;
  if (options.tone === 'error') return 8_000;
  return options.action ? 6_000 : 5_000;
}

const ICONS = { info: Info, success: CircleCheck, error: CircleAlert };

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const tone = item.tone ?? 'info';
  const Icon = ICONS[tone];

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(item.id), defaultDuration(item));
    return () => clearTimeout(timer);
  }, [item, onDismiss]);

  return (
    <div className={styles.toast} data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden="true" className={styles.icon} />
      <span className={styles.message}>{item.message}</span>
      {item.action && (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            item.action?.onClick();
            onDismiss(item.id);
          }}
        >
          {item.action.label}
        </button>
      )}
      <button
        type="button"
        className={styles.close}
        aria-label="Fechar aviso"
        onClick={() => onDismiss(item.id)}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Avisos no rodapé: "Vaga salva · Desfazer", erros da API, etc. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const show = useCallback((options: ToastOptions) => {
    const id = nextId.current++;
    setItems((current) => [...current, { ...options, id }].slice(-MAX_VISIBLE));
    return id;
  }, []);

  const value = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <section className={styles.region} aria-label="Avisos">
        {items.map((item) => (
          <Toast key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </section>
    </ToastContext.Provider>
  );
}
