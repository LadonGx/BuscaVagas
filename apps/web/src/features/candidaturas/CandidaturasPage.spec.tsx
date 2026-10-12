import type { ApplicationDetailDto, ApplicationStatus } from '@busca-vagas/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi } from '../../test/api-mock';
import { application, layoutRoutes } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { sortApplications } from './ApplicationsTable';
import { dropResult } from './Board';
import { stepsWithin } from './columns';
import { moveMessage } from './useMoveWithUndo';

const lumen = application();
const fluxo = application({
  id: 'app-2',
  status: 'in_process',
  nextStepAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
  nextStepNote: 'Teste técnico',
  updatedAt: '2026-10-08T13:00:00.000Z',
  job: { ...lumen.job, id: 'job-2', title: 'React Native Jr', company: 'Fluxo Bank' },
});
const tora = application({
  id: 'app-3',
  status: 'rejected',
  job: { ...lumen.job, id: 'job-3', title: 'Java Jr', company: 'Tora Indústria' },
});

type Call = { method: string; path: string; body?: unknown };

/** API com estado, como a de verdade: eventos mudam o status. */
function setup(initial: ApplicationDetailDto[] = [lumen, fluxo, tora]) {
  const apps = initial.map((item) => structuredClone(item));
  const calls: Call[] = [];
  let seq = 10;
  const find = (id: string) => apps.find((item) => item.id === id)!;
  const recompute = (app: ApplicationDetailDto) => {
    const sorted = [...app.events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    app.status = sorted.at(-1)!.status;
  };
  const body = (init: RequestInit) => (init.body ? JSON.parse(String(init.body)) : undefined);

  mockApi({
    ...layoutRoutes(),
    'GET /applications': () => ({
      items: apps.map(({ events: _events, ...rest }) => rest),
      nextCursor: null,
    }),
    'GET /applications/:id': (_u, _i, { id }) => find(id!),
    'POST /applications/:id/events': (_u, init, { id }) => {
      const input = body(init) as { status: ApplicationStatus; occurredAt?: string; note?: string };
      calls.push({ method: 'POST', path: `/applications/${id}/events`, body: input });
      const app = find(id!);
      seq += 1;
      app.events.push({
        id: `ev-${seq}`,
        status: input.status,
        previousStatus: app.status,
        occurredAt: input.occurredAt ?? new Date().toISOString(),
        note: input.note || null,
        createdAt: new Date(Date.now() + seq).toISOString(),
      });
      recompute(app);
      return app;
    },
    'DELETE /applications/:id/events/:eventId': (_u, _i, { id, eventId }) => {
      calls.push({ method: 'DELETE', path: `/applications/${id}/events/${eventId}` });
      const app = find(id!);
      app.events = app.events.filter((event) => event.id !== eventId);
      recompute(app);
      return app;
    },
    'PATCH /applications/:id': (_u, init, { id }) => {
      calls.push({ method: 'PATCH', path: `/applications/${id}`, body: body(init) });
      return Object.assign(find(id!), body(init));
    },
    'DELETE /applications/:id': (_u, _i, { id }) => {
      calls.push({ method: 'DELETE', path: `/applications/${id}` });
      apps.splice(apps.indexOf(find(id!)), 1);
      return new Response(null, { status: 204 });
    },
  });
  return { calls };
}

const column = (name: string) => screen.getByRole('region', { name: new RegExp(`^${name}`) });

describe('Candidaturas — quadro', () => {
  it('cada candidatura na sua coluna, com a próxima etapa em destaque', async () => {
    setup();
    renderApp('/candidaturas');

    await screen.findByRole('button', { name: 'Back-end Jr (NestJS)' });
    expect(within(column('Aplicada')).getByText('Back-end Jr (NestJS)')).toBeVisible();
    const inProcess = column('Em processo');
    expect(within(inProcess).getByText('React Native Jr')).toBeVisible();
    expect(within(inProcess).getByText(/Teste técnico ·/)).toBeVisible();
    expect(within(column('Encerradas')).getByText('Java Jr')).toBeVisible();
    expect(screen.getByText('3 no total · 1 com próxima etapa nos próximos 7 dias')).toBeVisible();
  });

  it('"Mover para…" registra o evento, muda de coluna e o desfazer apaga o evento', async () => {
    const { calls } = setup();
    renderApp('/candidaturas');
    await screen.findByRole('button', { name: 'Back-end Jr (NestJS)' });

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Mover Back-end Jr (NestJS) para' }),
      'in_process',
    );
    await waitFor(() =>
      expect(within(column('Em processo')).getByText('Back-end Jr (NestJS)')).toBeVisible(),
    );
    expect(await screen.findByText('Movida para Em processo.')).toBeVisible();
    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/applications/app-1/events',
      body: { status: 'in_process' },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(() =>
      expect(within(column('Aplicada')).getByText('Back-end Jr (NestJS)')).toBeVisible(),
    );
    expect(calls[1]).toMatchObject({ method: 'DELETE', path: '/applications/app-1/events/ev-11' });
  });

  it('aviso de mudança diz a coluna e, em Encerradas, o motivo', () => {
    expect(moveMessage('in_process')).toBe('Movida para Em processo.');
    expect(moveMessage('withdrawn')).toBe('Movida para Encerradas (Desisti).');
  });

  it('soltar numa coluna: mesma coluna não faz nada, Encerradas pergunta', () => {
    expect(dropResult('applied', 'in_process')).toBe('in_process');
    expect(dropResult('applied', 'applied')).toBeNull();
    expect(dropResult('applied', 'closed')).toBe('ask');
    expect(dropResult('rejected', 'closed')).toBeNull();
    expect(dropResult('offer', undefined)).toBeNull();
  });

  it('sem candidaturas: explica como criar uma', async () => {
    setup([]);
    renderApp('/candidaturas');
    expect(await screen.findByRole('heading', { name: 'Nenhuma candidatura ainda' })).toBeVisible();
  });
});

describe('Candidaturas — detalhe', () => {
  it('abre pela URL com a linha do tempo; único evento não pode ser apagado', async () => {
    setup();
    const { router } = renderApp('/candidaturas');

    await userEvent.click(await screen.findByRole('button', { name: 'Back-end Jr (NestJS)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Back-end Jr (NestJS)' });
    expect(router.state.location.pathname).toBe('/candidaturas/app-1');
    expect(within(dialog).getByText('Pela Gupy.')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Apagar etapa Aplicada' })).toBeDisabled();
    expect(within(dialog).getByRole('link', { name: 'Ver vaga' })).toHaveAttribute(
      'href',
      '/vagas?vaga=job-1',
    );

    await userEvent.keyboard('{Escape}');
    expect(router.state.location.pathname).toBe('/candidaturas');
  });

  it('registrar etapa envia status, data e anotação', async () => {
    const { calls } = setup();
    renderApp('/candidaturas/app-1');
    const dialog = await screen.findByRole('dialog', { name: 'Back-end Jr (NestJS)' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar etapa' }));
    expect(within(dialog).getByRole('combobox', { name: 'Status' })).toHaveValue('in_process');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Anotação' }), 'RH ligou');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toMatchObject({ status: 'in_process', note: 'RH ligou' });
    expect((calls[0]?.body as { occurredAt: string }).occurredAt).toMatch(/Z$/);
    expect(await within(dialog).findByText('RH ligou')).toBeVisible();
    expect(within(dialog).getByText(/antes: aplicada/)).toBeVisible();
  });

  it('marcar a próxima etapa', async () => {
    const { calls } = setup();
    renderApp('/candidaturas/app-1');
    const dialog = await screen.findByRole('dialog', { name: 'Back-end Jr (NestJS)' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Marcar' }));
    const when = within(dialog).getByLabelText('Quando');
    await userEvent.type(when, '2026-12-15T14:00');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'O quê' }), 'Entrevista');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar etapa' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      method: 'PATCH',
      body: { nextStepNote: 'Entrevista', nextStepAt: new Date('2026-12-15T14:00').toISOString() },
    });
  });

  it('apagar a candidatura pede um segundo clique', async () => {
    const { calls } = setup();
    const { router } = renderApp('/candidaturas/app-1');
    const dialog = await screen.findByRole('dialog', { name: 'Back-end Jr (NestJS)' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Apagar candidatura' }));
    expect(calls).toHaveLength(0);
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Clique de novo para apagar' }),
    );

    await waitFor(() => expect(calls).toEqual([{ method: 'DELETE', path: '/applications/app-1' }]));
    expect(await screen.findByText(/Candidatura apagada/)).toBeVisible();
    await waitFor(() => expect(router.state.location.pathname).toBe('/candidaturas'));
  });
});

describe('Candidaturas — lista', () => {
  it('tabela ordenável pelo cabeçalho', async () => {
    setup();
    renderApp('/candidaturas?vista=lista');

    const table = await screen.findByRole('table');
    const titles = () =>
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) => within(row).getAllByRole('cell')[0]?.textContent);
    expect(titles()[0]).toBe('React Native Jr'); // atualizada mais recente

    await userEvent.click(within(table).getByRole('button', { name: 'Empresa' }));
    expect(titles()).toEqual(['React Native Jr', 'Back-end Jr (NestJS)', 'Java Jr']);
    expect(within(table).getByRole('columnheader', { name: 'Empresa' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('ordenação e "próximos 7 dias" (funções puras)', () => {
    const now = new Date();
    expect(stepsWithin([lumen, fluxo, tora], now)).toBe(1);
    expect(sortApplications([lumen, fluxo], 'nextStepAt', 'asc').map((a) => a.id)).toEqual([
      'app-2',
      'app-1',
    ]);
  });
});
