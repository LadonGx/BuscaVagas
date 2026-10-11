import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useToast, type ToastOptions } from './toast-context';
import { ToastProvider } from './ToastProvider';

function Trigger({ options }: { options: ToastOptions }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.show(options)}>
      mostrar
    </button>
  );
}

function setup(options: ToastOptions) {
  render(
    <ToastProvider>
      <Trigger options={options} />
    </ToastProvider>,
  );
  return () => userEvent.click(screen.getByRole('button', { name: 'mostrar' }));
}

describe('avisos', () => {
  it('ação roda e fecha o aviso', async () => {
    const undo = vi.fn();
    const show = setup({ message: 'Vaga salva', action: { label: 'Desfazer', onClick: undo } });

    await show();
    expect(screen.getByRole('status')).toHaveTextContent('Vaga salva');
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(undo).toHaveBeenCalledOnce();
    expect(screen.queryByText('Vaga salva')).not.toBeInTheDocument();
  });

  it('erro é anunciado como alerta e fecha no X', async () => {
    const show = setup({ message: 'Falhou', tone: 'error' });
    await show();
    expect(screen.getByRole('alert')).toHaveTextContent('Falhou');
    await userEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('some sozinho depois do tempo', async () => {
    vi.useFakeTimers();
    try {
      render(
        <ToastProvider>
          <Trigger options={{ message: 'Pronto', duration: 1_000 }} />
        </ToastProvider>,
      );
      act(() => screen.getByRole('button', { name: 'mostrar' }).click());
      expect(screen.getByText('Pronto')).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(1_001));
      expect(screen.queryByText('Pronto')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
