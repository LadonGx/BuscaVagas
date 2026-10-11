import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readStoredTheme, setTheme, THEME_STORAGE_KEY, useTheme } from './theme';

describe('tema', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.theme = 'escuro';
  });

  it('padrão é escuro; só "claro" salvo muda', () => {
    expect(readStoredTheme()).toBe('escuro');
    localStorage.setItem(THEME_STORAGE_KEY, 'claro');
    expect(readStoredTheme()).toBe('claro');
    localStorage.setItem(THEME_STORAGE_KEY, 'roxo');
    expect(readStoredTheme()).toBe('escuro');
  });

  it('trocar muda o atributo na raiz e salva a escolha', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('escuro');

    act(() => result.current.toggle());
    expect(result.current.theme).toBe('claro');
    expect(document.documentElement.dataset.theme).toBe('claro');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('claro');

    act(() => result.current.toggle());
    expect(document.documentElement.dataset.theme).toBe('escuro');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('escuro');
  });

  it('sem storage disponível, troca o tema mesmo assim', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(() => setTheme('claro')).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('claro');
  });
});
