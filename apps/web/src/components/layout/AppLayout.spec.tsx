import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, reply } from '../../test/api-mock';
import { counts, healthy, inactiveBoard, run, source, summary } from '../../test/fixtures';
import { renderApp } from '../../test/render';

/** API "normal" para o layout: saúde, contagens, resumo e fontes. */
function baseRoutes(overrides: Parameters<typeof mockApi>[0] = {}) {
  return {
    'GET /health': () => healthy,
    'GET /jobs/counts': () => counts(),
    'GET /applications/summary': () => summary(),
    'GET /discovery/sources': () => [source(), inactiveBoard()],
    ...overrides,
  };
}

const nav = () => screen.getByRole('navigation', { name: 'Principal' });

describe('layout', () => {
  it('menu com os números de cada tela e o Início ativo', async () => {
    mockApi(baseRoutes());
    renderApp('/');

    const menu = nav();
    expect(within(menu).getByRole('link', { name: 'Início' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(await within(menu).findByRole('link', { name: 'Vagas, 142 na caixa' })).toBeVisible();
    expect(within(menu).getByRole('link', { name: 'Deslizar, 87 para triar' })).toBeVisible();
    // 4 aplicadas + 2 em processo + 1 proposta.
    expect(within(menu).getByRole('link', { name: 'Candidaturas, 7 em andamento' })).toBeVisible();
  });

  it('número zero não aparece', async () => {
    mockApi(
      baseRoutes({
        'GET /jobs/counts': () =>
          counts({ triage: { inbox: 0, saved: 0, dismissed: 0 }, swipeable: 0 }),
      }),
    );
    renderApp('/');
    await screen.findByText(/Próxima busca/);
    expect(within(nav()).getByRole('link', { name: 'Vagas' })).toBeVisible();
  });

  it('navegar troca a tela e o item ativo', async () => {
    mockApi(baseRoutes());
    renderApp('/');

    await userEvent.click(within(nav()).getByRole('link', { name: /Preferências/ }));
    expect(screen.getByRole('heading', { level: 1, name: 'Preferências' })).toBeVisible();
    expect(within(nav()).getByRole('link', { name: /Preferências/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('rodapé mostra a última busca das fontes ativas e a próxima', async () => {
    mockApi(baseRoutes());
    renderApp('/');

    expect(await screen.findByText('Gupy: há 2 h · 387 vagas')).toBeVisible();
    expect(screen.getByText(/^Próxima busca em (3 h 5\d min|4 h)$/)).toBeVisible();
    expect(screen.queryByText(/Greenhouse:/)).not.toBeInTheDocument();
  });

  it('endereço desconhecido mostra "não encontrada" com o menu', async () => {
    mockApi(baseRoutes());
    renderApp('/nada-aqui');
    expect(await screen.findByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
    expect(nav()).toBeVisible();
  });
});

describe('API fora do ar', () => {
  it('sem resposta: faixa com o comando para subir a API', async () => {
    mockApi(
      baseRoutes({
        'GET /health': () => {
          throw new TypeError('Failed to fetch');
        },
      }),
    );
    renderApp('/');
    expect(await screen.findByRole('alert')).toHaveTextContent('Rode pnpm dev:api');
  });

  it('503: diz quem caiu', async () => {
    mockApi(
      baseRoutes({
        'GET /health': () =>
          reply(503, { status: 'degraded', checks: { database: 'up', redis: 'down' } }),
      }),
    );
    renderApp('/');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('a fila (Redis) não');
    expect(alert).not.toHaveTextContent('Postgres');
  });

  it('tudo no ar: sem faixa', async () => {
    mockApi(baseRoutes());
    renderApp('/');
    await screen.findByText(/Próxima busca/);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('tema', () => {
  it('abre escuro e troca para claro pelo menu, salvando a escolha', async () => {
    mockApi(baseRoutes());
    renderApp('/');

    await userEvent.click(screen.getByRole('button', { name: 'Modo claro' }));
    expect(document.documentElement.dataset.theme).toBe('claro');
    expect(localStorage.getItem('busca-vagas:tema')).toBe('claro');
    expect(screen.getByRole('button', { name: 'Modo escuro' })).toBeVisible();
  });
});

describe('Buscar agora', () => {
  it('enfileira, avisa o que buscou e o que não, e recarrega as vagas no fim', async () => {
    let running = false;
    let countsCalls = 0;
    mockApi(
      baseRoutes({
        'GET /jobs/counts': () => {
          countsCalls += 1;
          return counts();
        },
        // Enquanto roda, a última execução no banco é a atual: status running, 0 vagas.
        'GET /discovery/sources': () => [
          source(running ? { running, lastRun: run({ status: 'running', jobsFound: 0 }) } : {}),
          inactiveBoard(),
        ],
        'POST /discovery/scan': () => {
          running = true;
          return {
            queued: [{ sourceId: 'gupy', jobId: '1' }],
            alreadyQueued: [],
            inactive: [{ sourceId: 'greenhouse', reason: 'GREENHOUSE_COMPANIES vazio' }],
            unknown: [],
            terms: ['dev'],
          };
        },
      }),
    );
    const { queryClient } = renderApp('/');

    await userEvent.click(await screen.findByRole('button', { name: 'Buscar agora' }));

    expect(
      await screen.findByText(
        'Buscando em Gupy. Greenhouse está desligada (o motivo aparece em Preferências → Fontes).',
      ),
    ).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Buscando…' })).toBeDisabled();
    // Durante a busca, o rodapé não mostra a execução em andamento como "0 vagas".
    expect(screen.getByText('Gupy: buscando agora…')).toBeVisible();
    expect(screen.queryByText(/Próxima busca/)).not.toBeInTheDocument();

    // A fonte termina: o botão volta e as contagens são buscadas de novo.
    const before = countsCalls;
    running = false;
    await queryClient.invalidateQueries({ queryKey: ['discovery', 'sources'] });
    expect(await screen.findByRole('button', { name: 'Buscar agora' })).toBeEnabled();
    expect(await screen.findByText('Gupy: há 2 h · 387 vagas')).toBeVisible();
    await waitFor(() => expect(countsCalls).toBeGreaterThan(before));
  });

  it('erro da API vira aviso de erro', async () => {
    mockApi(
      baseRoutes({
        'POST /discovery/scan': () => reply(503, { message: 'Fila fora do ar' }),
      }),
    );
    renderApp('/');

    await userEvent.click(await screen.findByRole('button', { name: 'Buscar agora' }));
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((alert) => alert.textContent?.includes('Fila fora do ar'))).toBe(true);
  });
});
