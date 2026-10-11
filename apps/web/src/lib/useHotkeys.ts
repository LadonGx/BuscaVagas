import { useEffect, useRef } from 'react';

export type HotkeyMap = Record<string, (event: KeyboardEvent) => void>;

/** "ctrl+z", "ArrowRight", " " (espaço). Meta (⌘) conta como ctrl. */
export function hotkeyName(event: KeyboardEvent): string {
  const ctrl = event.ctrlKey || event.metaKey ? 'ctrl+' : '';
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  return `${ctrl}${key}`;
}

function typingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Atalhos de teclado da tela. Ignorados enquanto se digita num campo, quando
 * `enabled` é falso (ex.: painel aberto) ou quando um diálogo modal está na
 * frente.
 */
export function useHotkeys(map: HotkeyMap, enabled = true): void {
  const mapRef = useRef(map);

  useEffect(() => {
    mapRef.current = map;
  }, [map]);

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || typingInField(event.target)) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const handler = mapRef.current[hotkeyName(event)];
      if (!handler) return;
      event.preventDefault();
      handler(event);
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
