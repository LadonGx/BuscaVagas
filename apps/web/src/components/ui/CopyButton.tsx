import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useToast } from '../toast/toast-context';
import styles from './CopyButton.module.css';

/** Quanto tempo o botão fica em "Copiado". */
export const COPIED_MS = 1_500;

interface CopyButtonProps {
  /** O que vai para a área de transferência. Vazio desabilita o botão. */
  text: string;
  /** Do que é a cópia, para o leitor de tela: "Copiar {what}". */
  what: string;
  /** Rótulo visível. Padrão: "Copiar". */
  children?: string;
  className?: string;
}

/** Copia o texto e vira "Copiado" por 1,5 s. */
export function CopyButton({ text, what, children = 'Copiar', className }: CopyButtonProps) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      toast.show({
        tone: 'error',
        message: 'O navegador não deixou copiar. Selecione o texto e use Ctrl+C.',
      });
    }
  }

  return (
    <button
      type="button"
      className={[styles.copy, className].filter(Boolean).join(' ')}
      data-copied={copied || undefined}
      disabled={!text}
      aria-label={copied ? `${what} copiado` : `Copiar ${what}`}
      title={text ? undefined : 'Nada para copiar ainda'}
      onClick={copy}
    >
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      {copied ? 'Copiado' : children}
    </button>
  );
}
