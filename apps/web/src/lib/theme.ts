import { useSyncExternalStore } from 'react';

/**
 * Tema escuro (padrão) ou claro, salvo no navegador. O `index.html` aplica o
 * tema salvo antes do React montar — mesma chave e mesmos valores daqui.
 */
export const THEMES = ['escuro', 'claro'] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = 'escuro';
export const THEME_STORAGE_KEY = 'busca-vagas:tema';

/** O storage pode não existir ou lançar erro (modo privado, bloqueado). */
function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readStoredTheme(): Theme {
  try {
    return storage()?.getItem(THEME_STORAGE_KEY) === 'claro' ? 'claro' : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'claro' ? 'claro' : 'escuro';
}

const listeners = new Set<() => void>();

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    storage()?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Sem storage o tema vale só até fechar a aba. Tudo bem.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Tema atual e a troca. Todos os componentes que usam veem a mesma coisa. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => DEFAULT_THEME);
  return { theme, toggle: () => setTheme(theme === 'escuro' ? 'claro' : 'escuro') };
}
