import { createContext, useContext } from 'react';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  /** Ex.: "Desfazer". Clicar também fecha o aviso. */
  action?: { label: string; onClick: () => void };
  /** Em ms. Padrão: 5 s; com ação, 6 s; erro, 8 s. */
  duration?: number;
}

export interface ToastApi {
  show: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast fora do ToastProvider');
  return context;
}
