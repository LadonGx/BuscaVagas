import type { JobDto } from '@busca-vagas/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { jobFlags } from '../../components/job/JobFlags';
import { mockApi } from '../../test/api-mock';
import { counts, job, layoutRoutes } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { availabilityTitle } from './JobAvailability';

const name = (id: string) => id;
const none = { state: null, reason: null, closedAt: null, checkedAt: null, deadline: null };
const closed: JobDto['availability'] = {
  state: 'closed',
  reason: 'Saiu do board da empresa no Greenhouse',
  closedAt: '2026-10-10T15:00:00.000Z',
  checkedAt: '2026-10-10T15:00:00.000Z',
  deadline: null,
};

describe('Ainda está aberta? — peças', () => {
  it('selos: encerrada (com o motivo na dica) e prazo', () => {
    expect(jobFlags(job({ availability: closed }), name)).toEqual([
      {
        key: 'closed',
        text: 'Encerrada',
        tone: 'bad',
        title: 'Saiu do board da empresa no Greenhouse',
      },
    ]);
    expect(
      jobFlags(job({ availability: { ...none, deadline: '2026-12-08T00:00:00.000Z' } }), name).map(
        (flag) => [flag.text, flag.title],
      ),
    ).toEqual([['Inscrições até 08/12', 'Prazo de inscrição: 08/12/2026.']]);
    expect(jobFlags(job(), name)).toEqual([]);
  });

  it('título do estado', () => {
    expect(availabilityTitle(none)).toBe('Ainda não conferida');
    expect(availabilityTitle(closed)).toBe('Encerrada desde 10/10/2026');
    expect(availabilityTitle({ ...none, state: 'open' })).toBe('Aberta');
    expect(availabilityTitle({ ...none, state: 'unknown' })).toBe('Não deu para saber');
  });
});

describe('Ainda está aberta? — telas', () => {
  it('painel: "Conferir agora" chama a API e mostra o resultado no painel e no cartão', async () => {
    let current = job({ id: 'j1', title: 'Dev Júnior' });
    const calls: string[] = [];
    mockApi({
      ...layoutRoutes(),
      'GET /jobs': () => ({ items: [current], nextCursor: null }),
      'GET /jobs/:id': () => current,
      'POST /jobs/:id/check': (_url, _init, params) => {
        calls.push(params.id!);
        current = { ...current, availability: closed };
        return current;
      },
      'GET /dashboard': () => ({}),
    });
    const user = userEvent.setup();
    renderApp('/vagas?vaga=j1');

    const drawer = await screen.findByRole('dialog', { name: /Dev Júnior/ });
    const section = within(drawer).getByRole('region', { name: 'Ainda está aberta?' });
    expect(section).toHaveTextContent('Ainda não conferida');

    await user.click(within(section).getByRole('button', { name: 'Conferir agora' }));
    await waitFor(() => expect(section).toHaveTextContent('Encerrada desde 10/10/2026'));
    expect(section).toHaveTextContent('Saiu do board da empresa no Greenhouse');
    expect(calls).toEqual(['j1']);
    // Aviso (toast) com o resultado.
    expect(
      await screen.findByText(/Encerrada desde 10\/10\/2026: Saiu do board/),
    ).toBeInTheDocument();

    // O cartão da lista também ganha o selo, sem recarregar.
    const card = screen.getByRole('article', { name: 'Dev Júnior' });
    expect(within(card).getByRole('list', { name: 'Avisos da vaga' })).toHaveTextContent(
      'Encerrada',
    );
  });

  it('Vagas: "Esconder encerradas" vem ligado; desligar guarda na URL e pede tudo', async () => {
    const queries: URLSearchParams[] = [];
    mockApi({
      ...layoutRoutes(),
      'GET /jobs/counts': () =>
        counts({ triage: { inbox: 10, saved: 2, dismissed: 1 }, inboxClosed: 3 }),
      'GET /jobs': (url) => {
        queries.push(url.searchParams);
        return { items: [], nextCursor: null };
      },
    });
    const user = userEvent.setup();
    const { router } = renderApp('/vagas');

    const toggle = await screen.findByRole('checkbox', { name: 'Esconder encerradas' });
    expect(toggle).toBeChecked();
    await waitFor(() => expect(queries.at(-1)?.get('hideClosed')).toBe('true'));
    expect(await screen.findByText(/7 na caixa · 3 encerradas escondidas/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Caixa\s*7/ })).toBeInTheDocument();

    await user.click(toggle);
    await waitFor(() => expect(router.state.location.search).toBe('?encerradas=mostrar'));
    await waitFor(() => expect(queries.at(-1)?.get('hideClosed')).toBeNull());
    expect(screen.getByRole('button', { name: /Caixa\s*10/ })).toBeInTheDocument();

    // Salvas nunca somem: ali a opção nem aparece.
    await user.click(screen.getByRole('button', { name: /Salvas/ }));
    await waitFor(() =>
      expect(
        screen.queryByRole('checkbox', { name: 'Esconder encerradas' }),
      ).not.toBeInTheDocument(),
    );
  });
});
