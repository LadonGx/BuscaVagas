import { useEffect, useState } from 'react';

/**
 * Campo de busca ligado à URL, com espera de digitação.
 *
 * Só o que a pessoa digita vai para a URL (depois de `delay` ms parada). Se a
 * URL muda por fora — Voltar, um link dentro do app, "Limpar filtros" —, o
 * campo passa a mostrar o valor novo, e o texto antigo não é escrito de volta.
 *
 * `value` é o valor atual na URL (já sem espaços nas pontas).
 */
export function useSearchText(value: string, commit: (text: string) => void, delay: number) {
  const [text, setText] = useState(value);
  /** A pessoa digitou algo que ainda não foi para a URL. */
  const [typed, setTyped] = useState(false);
  /** O valor da URL que o campo já levou em conta. */
  const [seen, setSeen] = useState(value);
  /** O último valor que este campo mandou para a URL (para reconhecer o eco). */
  const [pushed, setPushed] = useState<string | null>(null);

  if (value !== seen) {
    setSeen(value);
    setPushed(null);
    // O eco do que acabou de ser enviado não mexe no campo (a pessoa pode ter
    // continuado digitando); qualquer outra mudança vem de fora e ganha.
    if (value !== pushed) {
      setText(value);
      setTyped(false);
    }
  }

  useEffect(() => {
    if (!typed) return;
    const timer = setTimeout(() => {
      setTyped(false);
      const next = text.trim();
      if (next === value) return;
      setPushed(next);
      commit(text);
    }, delay);
    return () => clearTimeout(timer);
  }, [typed, text, value, commit, delay]);

  return {
    text,
    onChange: (next: string) => {
      setText(next);
      setTyped(true);
    },
  };
}
