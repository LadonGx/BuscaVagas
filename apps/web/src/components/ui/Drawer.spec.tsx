import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Drawer } from './Drawer';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        eyebrow="Acme · via Gupy"
        title="Desenvolvedor Júnior"
        footer={<button type="button">Salvar</button>}
      >
        <a href="#x">Abrir no site</a>
      </Drawer>
    </>
  );
}

describe('Drawer', () => {
  it('abre com nome, prende o foco e devolve ao fechar com Esc', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Abrir' });

    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Desenvolvedor Júnior' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');

    // Tab circula: Fechar → link → Salvar → volta para Fechar.
    await user.tab();
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus();
    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Salvar' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
  });

  it('fecha no X e clicando fora', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    const overlay = document.body.querySelector('[aria-hidden="true"]:not(svg)');
    expect(overlay).not.toBeNull();
    await user.click(overlay as Element);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(container).toBeInTheDocument();
  });
});
