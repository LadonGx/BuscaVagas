import { useEffect, useRef } from 'react';

/**
 * Chama `onReach` quando o elemento do `ref` chega perto da tela (300 px
 * antes). A lista também mostra um botão "Carregar mais" de reserva.
 */
export function useInfiniteScroll<T extends Element>(onReach: () => void, enabled: boolean) {
  const ref = useRef<T>(null);
  const callback = useRef(onReach);

  useEffect(() => {
    callback.current = onReach;
  }, [onReach]);

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) callback.current();
      },
      { rootMargin: '300px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled]);

  return ref;
}
