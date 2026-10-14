import type { NotificationDto, NotificationsDto } from '@busca-vagas/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { keys } from '../../api/keys';
import { mockApi } from '../../test/api-mock';
import { layoutRoutes } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { jobStatus } from './NotificationBell';

const notification = (overrides: Partial<NotificationDto> = {}): NotificationDto => ({
  id: 'n-1',
  kind: 'high-score',
  createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  readAt: null,
  minScore: 800,
  jobs: [
    { id: 'j-1', title: 'Dev Júnior', company: 'Acme', score: 912, triage: 'inbox', closed: false },
    {
      id: 'j-2',
      title: 'Back-end Jr',
      company: 'Beta',
      score: 850,
      triage: 'dismissed',
      closed: false,
    },
    { id: 'j-3', title: 'Front Jr', company: 'Gama', score: 820, triage: 'inbox', closed: true },
  ],
  ...overrides,
});

function setup(initial: NotificationsDto) {
  let state = initial;
  const calls: string[] = [];
  mockApi({
    ...layoutRoutes(),
    'GET /notifications': () => state,
    'POST /notifications/read': () => {
      calls.push('read');
      state = {
        unread: 0,
        items: state.items.map((item) => ({ ...item, readAt: new Date().toISOString() })),
      };
      return state;
    },
    'PUT /notifications/settings': (_u, init) => {
      const body = JSON.parse(String(init.body)) as { minScore: number };
      calls.push(`settings:${body.minScore}`);
      return body;
    },
    'GET /jobs': () => ({ items: [], nextCursor: null }),
    'GET /jobs/:id': () => new Response(JSON.stringify({ message: 'x' }), { status: 404 }),
    'GET /preferences/stacks': () => [],
    'GET /resume/stacks': () => ({ sections: [], stacks: [] }),
    'GET /maintenance/retention': () => ({
      enabled: true,
      days: 30,
      cutoff: '2026-09-12T00:00:00.000Z',
      dismissed: 0,
      stale: 0,
      sourceRuns: 0,
      forgottenExpired: 0,
      dryRun: true,
    }),
    'GET /discovery/runs': () => ({ items: [], nextCursor: null }),
  });
  return {
    calls,
    push: (next: NotificationsDto) => {
      state = next;
    },
  };
}

describe('Sino de avisos', () => {
  it('mostra quantos são novos; abrir lista as vagas e marca tudo como lido', async () => {
    const { calls } = setup({
      unread: 2,
      items: [
        notification(),
        notification({ id: 'n-0', readAt: '2026-10-10T12:00:00.000Z', jobs: [] }),
      ],
    });
    const user = userEvent.setup();
    const { router } = renderApp('/entrevistas');

    const bell = await screen.findByRole('button', { name: 'Avisos, 2 novos' });
    await user.click(bell);

    const drawer = await screen.findByRole('dialog', { name: /Avisos/ });
    await waitFor(() => expect(calls).toEqual(['read']));
    const items = within(drawer)
      .getAllByRole('listitem')
      .filter((li) => li.parentElement?.tagName === 'OL');
    expect(items[0]).toHaveTextContent('3 vagas novas com nota alta');
    expect(items[0]).toHaveTextContent('novo');
    expect(items[0]).toHaveTextContent('Beta · descartada');
    expect(items[0]).toHaveTextContent('Gama · encerrada');
    expect(items[1]).toHaveTextContent('As vagas deste aviso já saíram pela limpeza.');
    expect(within(drawer).getByText(/nota ≥ 800/)).toBeInTheDocument();

    await user.click(within(drawer).getByRole('button', { name: /Dev Júnior/ }));
    await waitFor(() => expect(router.state.location.search).toBe('?vaga=j-1'));
    expect(router.state.location.pathname).toBe('/vagas');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /Avisos/ })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Avisos' })).toBeInTheDocument();
  });

  it('aviso novo com o app aberto vira toast com "Ver"', async () => {
    const { push } = setup({ unread: 0, items: [] });
    const user = userEvent.setup();
    const { queryClient } = renderApp('/entrevistas');
    // Espera a primeira leitura: o que já estava lá não vira toast.
    await waitFor(() => expect(queryClient.getQueryData(keys.notifications)).toBeDefined());
    expect(screen.queryByText(/com nota alta/)).not.toBeInTheDocument();

    push({ unread: 1, items: [notification({ id: 'n-2', jobs: [notification().jobs[0]!] })] });
    await queryClient.invalidateQueries({ queryKey: keys.notifications });

    expect(await screen.findByText('1 vaga nova com nota alta')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver' }));
    expect(await screen.findByRole('dialog', { name: /Avisos/ })).toBeInTheDocument();
  });

  it('Preferências → Aviso de nota alta: muda a nota e desliga', async () => {
    const { calls } = setup({ unread: 0, items: [] });
    const user = userEvent.setup();
    renderApp('/preferencias');

    const card = await screen.findByRole('region', { name: 'Aviso de nota alta' });
    const score = await within(card).findByRole('spinbutton');
    const save = within(card).getByRole('button', { name: 'Salvar avisos' });
    expect(save).toBeDisabled();

    await user.clear(score);
    await user.type(score, '1500');
    expect(within(card).getByText('Use um número inteiro de 1 a 1000.')).toBeInTheDocument();
    expect(save).toBeDisabled();

    await user.clear(score);
    await user.type(score, '900');
    await user.click(save);
    await waitFor(() => expect(calls).toContain('settings:900'));

    await user.click(within(card).getByRole('checkbox', { name: /Avisar no sino/ }));
    await user.click(within(card).getByRole('button', { name: 'Salvar avisos' }));
    await waitFor(() => expect(calls).toContain('settings:0'));
  });
});

describe('peças', () => {
  it('situação da vaga no aviso', () => {
    const [open, dismissed, closed] = notification().jobs;
    expect(jobStatus(open!)).toBeNull();
    expect(jobStatus(dismissed!)).toBe('descartada');
    expect(jobStatus(closed!)).toBe('encerrada');
  });
});
