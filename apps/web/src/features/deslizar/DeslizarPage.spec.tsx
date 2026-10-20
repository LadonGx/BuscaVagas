import type { JobDto } from '@busca-vagas/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, reply } from '../../test/api-mock';
import { job, layoutRoutes } from '../../test/fixtures';
import { renderApp } from '../../test/render';

const first = job({ id: 'a', title: 'Primeira vaga', score: 950 });
const second = job({ id: 'b', title: 'Segunda vaga', score: 800 });

/** API com estado: a triagem tira a vaga da caixa, como a de verdade. */
function setup(initial: JobDto[] = [first, second], extra: Parameters<typeof mockApi>[0] = {}) {
  const items = initial.map((item) => ({ ...item }));
  const puts: { id: string; body: unknown }[] = [];
  let listQuery: URLSearchParams | undefined;

  mockApi({
    ...layoutRoutes(),
    'GET /jobs': (url) => {
      listQuery = url.searchParams;
      return { items: items.filter((item) => item.triage === 'inbox'), nextCursor: null };
    },
    'GET /jobs/:id': (_url, _init, { id }) => items.find((item) => item.id === id),
    'PUT /jobs/:id/triage': (_url, init, { id }) => {
      const body = JSON.parse(String(init.body)) as { status: JobDto['triage'] };
      puts.push({ id, body });
      const target = items.find((item) => item.id === id);
      if (target) target.triage = body.status;
      return target;
    },
    ...extra,
  });
  return { puts, query: () => listQuery };
}

const currentTitle = () =>
  within(screen.getByRole('article', { name: /^Vaga atual:/ })).getByRole('heading', { level: 2 });

describe('Deslizar', () => {
  it('mostra a primeira da caixa, sem incompatíveis', async () => {
    const { query } = setup();
    renderApp('/deslizar');

    expect(await screen.findByRole('article', { name: 'Vaga atual: Primeira vaga' })).toBeVisible();
    expect(query()?.get('triage')).toBe('inbox');
    expect(query()?.get('hideIncompatible')).toBe('true');
    expect(query()?.get('hideClosed')).toBe('true');
  });

  it('→ salva, ← descarta, e a próxima aparece', async () => {
    const { puts } = setup();
    renderApp('/deslizar');
    await screen.findByRole('article', { name: 'Vaga atual: Primeira vaga' });

    await userEvent.keyboard('{ArrowRight}');
    expect(await screen.findByRole('article', { name: 'Vaga atual: Segunda vaga' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Salva: Primeira vaga');

    await userEvent.keyboard('{ArrowLeft}');
    expect(await screen.findByRole('heading', { name: 'Tudo triado' })).toBeVisible();

    await waitFor(() =>
      expect(puts).toEqual([
        { id: 'a', body: { status: 'saved' } },
        { id: 'b', body: { status: 'dismissed', reason: null } },
      ]),
    );
    expect(screen.getByText(/Nesta sessão:/)).toHaveTextContent('1 salva · 1 descartada');
  });

  it('mostra o total salvo e descartado (a sessão zera ao recarregar)', async () => {
    setup();
    renderApp('/deslizar');
    const link = await screen.findByRole('link', { name: '25 descartadas' });
    expect(link).toHaveAttribute('href', '/vagas?aba=descartadas');
    expect(screen.getByRole('link', { name: '18 salvas' })).toHaveAttribute(
      'href',
      '/vagas?aba=salvas',
    );
  });

  it('Ctrl+Z desfaz a última e a vaga volta a ser a atual', async () => {
    const { puts } = setup();
    renderApp('/deslizar');
    await screen.findByRole('article', { name: 'Vaga atual: Primeira vaga' });

    await userEvent.keyboard('{ArrowLeft}');
    await screen.findByRole('article', { name: 'Vaga atual: Segunda vaga' });
    await userEvent.keyboard('{Control>}z{/Control}');

    expect(await screen.findByRole('article', { name: 'Vaga atual: Primeira vaga' })).toBeVisible();
    await waitFor(() => expect(puts.at(-1)).toEqual({ id: 'a', body: { status: 'inbox' } }));
    expect(screen.getByRole('button', { name: 'Desfazer (Ctrl+Z)' })).toBeDisabled();
  });

  it('botões fazem o mesmo que as setas', async () => {
    const { puts } = setup();
    renderApp('/deslizar');
    await screen.findByRole('article', { name: 'Vaga atual: Primeira vaga' });

    await userEvent.click(screen.getByRole('button', { name: 'Salvar (seta para a direita)' }));
    await screen.findByRole('article', { name: 'Vaga atual: Segunda vaga' });
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await screen.findByRole('article', { name: 'Vaga atual: Primeira vaga' });
    await waitFor(() =>
      expect(puts.map((put) => put.body)).toEqual([{ status: 'saved' }, { status: 'inbox' }]),
    );
  });

  it('tecla repetida rápido não envia a mesma vaga duas vezes', async () => {
    const { puts } = setup([first]);
    renderApp('/deslizar');
    await screen.findByRole('article', { name: 'Vaga atual: Primeira vaga' });

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    await screen.findByRole('heading', { name: 'Tudo triado' });
    expect(puts).toHaveLength(1);
  });

  it('↑ abre o detalhe e, com ele aberto, as setas não triam', async () => {
    const { puts } = setup();
    renderApp('/deslizar');
    await screen.findByRole('article', { name: 'Vaga atual: Primeira vaga' });

    await userEvent.keyboard('{ArrowUp}');
    expect(await screen.findByRole('dialog', { name: 'Primeira vaga' })).toBeVisible();
    await userEvent.keyboard('{ArrowRight}');
    expect(puts).toHaveLength(0);

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(currentTitle()).toHaveTextContent('Primeira vaga');
  });

  it('arrastar para a direita além do limite salva; pouco, volta', async () => {
    const { puts } = setup();
    renderApp('/deslizar');
    const card = await screen.findByRole('article', { name: 'Vaga atual: Primeira vaga' });

    fireEvent.pointerDown(card, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(card, { clientX: 150, pointerId: 1 });
    fireEvent.pointerUp(card, { clientX: 150, pointerId: 1 });
    expect(puts).toHaveLength(0);

    fireEvent.pointerDown(card, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(card, { clientX: 300, pointerId: 1 });
    fireEvent.pointerUp(card, { clientX: 300, pointerId: 1 });
    await waitFor(() => expect(puts).toEqual([{ id: 'a', body: { status: 'saved' } }]));
  });

  it('erro da API: a vaga volta e o aviso aparece', async () => {
    setup([first, second], { 'PUT /jobs/:id/triage': () => reply(500, { message: 'Falhou' }) });
    renderApp('/deslizar');
    await screen.findByRole('article', { name: 'Vaga atual: Primeira vaga' });

    await userEvent.keyboard('{ArrowRight}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Falhou');
    expect(currentTitle()).toHaveTextContent('Primeira vaga');
    expect(screen.queryByRole('status', { name: /Salva:/ })).not.toBeInTheDocument();
  });

  it('falha no meio de triagens rápidas: a vaga que falhou volta e pode ser triada de novo', async () => {
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const items = [first, second].map((item) => ({ ...item }));
    const puts: string[] = [];
    let failed = false;
    setup([], {
      'GET /jobs': () => ({
        items: items.filter((item) => item.triage === 'inbox'),
        nextCursor: null,
      }),
      'PUT /jobs/:id/triage': async (_url, init, { id }) => {
        puts.push(id);
        const body = JSON.parse(String(init.body)) as { status: JobDto['triage'] };
        // A primeira da Primeira vaga falha, e antes de a Segunda terminar.
        if (id === 'a' && !failed) {
          failed = true;
          await wait(30);
          return reply(500, { message: 'Falhou' });
        }
        await wait(id === 'b' ? 120 : 0);
        const target = items.find((item) => item.id === id)!;
        target.triage = body.status;
        return target;
      },
    });
    renderApp('/deslizar');
    await screen.findByRole('article', { name: 'Vaga atual: Primeira vaga' });

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    await screen.findByRole('article', { name: 'Vaga atual: Segunda vaga' });
    fireEvent.keyDown(document, { key: 'ArrowRight' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Falhou');
    await waitFor(() => expect(puts).toEqual(['a', 'b']));
    await waitFor(() => expect(currentTitle()).toHaveTextContent('Primeira vaga'), {
      timeout: 2_000,
    });
    await waitFor(() =>
      expect(screen.getByText(/Nesta sessão:/)).toHaveTextContent('1 salva · 0 descartadas'),
    );

    // Não ficou presa: a mesma vaga vai de novo.
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(await screen.findByRole('heading', { name: 'Tudo triado' })).toBeVisible();
    expect(puts).toEqual(['a', 'b', 'a']);
  });

  it('caixa vazia diz quando vem a próxima busca', async () => {
    setup([]);
    renderApp('/deslizar');
    expect(await screen.findByRole('heading', { name: 'Tudo triado' })).toBeVisible();
    expect(screen.getByText(/A próxima busca automática roda em/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Salvar (seta para a direita)' })).toBeDisabled();
  });
});
