import type { MetricsDto } from '@busca-vagas/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi } from '../../test/api-mock';
import { layoutRoutes, source } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { stackRow, weekLabel } from './Charts';
import { formatDays, periodFromParam } from './MetricasPage';

const metrics = (overrides: Partial<MetricsDto> = {}): MetricsDto => ({
  days: 90,
  since: '2026-07-16T18:00:00.000Z',
  sources: [
    { sourceId: 'gupy', found: 120, compatible: 80, saved: 12, applied: 8, responded: 3 },
    { sourceId: 'manual', found: 2, compatible: 2, saved: 2, applied: 2, responded: 2 },
    { sourceId: 'greenhouse', found: 30, compatible: 20, saved: 3, applied: 0, responded: 0 },
  ],
  stacks: {
    jobs: 152,
    top: [
      { name: 'docker', jobs: 76, share: 0.5, inResume: false },
      { name: 'react', jobs: 61, share: 0.4, inResume: true },
    ],
    missing: [{ name: 'docker', jobs: 76, share: 0.5, inResume: false }],
    resumeHasStacks: true,
  },
  responses: {
    applications: 10,
    responded: 5,
    medianDays: 4.5,
    buckets: [
      { label: 'até 3 dias', count: 2 },
      { label: '4 a 7', count: 2 },
      { label: '8 a 14', count: 1 },
      { label: '15 a 30', count: 0 },
      { label: 'mais de 30', count: 0 },
    ],
    waiting: 4,
    waitingStale: 3,
  },
  weekly: [
    { week: '2026-09-28', sent: 3, responded: 1 },
    { week: '2026-10-05', sent: 5, responded: 3 },
    { week: '2026-10-12', sent: 2, responded: 1 },
  ],
  ...overrides,
});

function setup(data = metrics()) {
  const queries: string[] = [];
  mockApi({
    ...layoutRoutes(),
    'GET /discovery/sources': () => [
      source(),
      source({ id: 'greenhouse', displayName: 'Greenhouse' }),
    ],
    'GET /metrics': (url) => {
      queries.push(url.search);
      return {
        ...data,
        days: url.searchParams.get('days') === '0' ? null : Number(url.searchParams.get('days')),
      };
    },
  });
  return { queries };
}

describe('Métricas', () => {
  it('resumo, fontes, tempo até a resposta e stacks', async () => {
    const { queries } = setup();
    renderApp('/metricas');

    const summary = await screen.findByRole('region', { name: 'Resumo do período' });
    expect(queries[0]).toBe('?days=90');
    expect(summary).toHaveTextContent('152Vagas que entraram3 fontes');
    expect(summary).toHaveTextContent('50%Taxa de resposta');
    expect(summary).toHaveTextContent('4,5 diasAté a resposta');
    expect(screen.getByText(/Desde 16\/07\/2026/)).toBeInTheDocument();

    const table = screen.getByRole('table', { name: 'Rendimento por fonte' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      'Gupy12080 67%1283 (38%)',
      'Cadastro manual22 100%222 (100%)',
      'Greenhouse3020 67%30—',
    ]);

    const waiting = screen.getByText(/4 candidaturas sem resposta/);
    expect(waiting).toHaveTextContent('3 há mais de 14 dias');

    const market = screen.getByRole('list', { name: 'Stacks mais pedidas' });
    const items = within(market).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('docker76 vagas · 50%');
    expect(items[1]).toHaveTextContent('reactno currículo61 vagas · 40%');
    expect(
      within(screen.getByRole('list', { name: 'Stacks que faltam no currículo' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(1);
  });

  it('período na URL e na consulta', async () => {
    const { queries } = setup();
    const user = userEvent.setup();
    const { router } = renderApp('/metricas');

    await screen.findByRole('region', { name: 'Resumo do período' });
    await user.click(screen.getByRole('button', { name: 'Tudo' }));
    await waitFor(() => expect(queries.at(-1)).toBe('?days=0'));
    expect(router.state.location.search).toBe('?periodo=tudo');
    expect(screen.getByRole('button', { name: 'Tudo' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: '90 dias' }));
    expect(router.state.location.search).toBe('');
  });

  it('candidaturas por semana: resumo acessível, setas e tabela', async () => {
    setup();
    const user = userEvent.setup();
    renderApp('/metricas?periodo=30');

    const chart = await screen.findByRole('img', { name: /Candidaturas por semana/ });
    expect(chart).toHaveAccessibleName(
      'Candidaturas por semana: 10 candidaturas, 5 com resposta; pico de 5 na semana de 05/10. Use as setas para ver cada semana.',
    );
    chart.focus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByText('Semana de 12/10: 2 candidaturas, 1 com resposta')).toBeInTheDocument();

    const table = screen.getByRole('table', { name: 'Candidaturas por semana' });
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(screen.getByRole('list', { name: 'Legenda' })).toHaveTextContent(
      'Com respostaSem resposta (ainda)',
    );
  });

  it('sem dados: mensagens no lugar dos gráficos', async () => {
    setup(
      metrics({
        sources: [],
        stacks: { jobs: 0, top: [], missing: [], resumeHasStacks: false },
        responses: {
          applications: 0,
          responded: 0,
          medianDays: null,
          buckets: [],
          waiting: 0,
          waitingStale: 0,
        },
        weekly: [{ week: '2026-10-12', sent: 0, responded: 0 }],
      }),
    );
    renderApp('/metricas');

    expect(await screen.findByText('Nenhuma candidatura no período.')).toBeInTheDocument();
    expect(screen.getByText(/Nenhuma resposta no período ainda/)).toBeInTheDocument();
    expect(screen.getByText('Nenhuma vaga no período.')).toBeInTheDocument();
    expect(screen.getByText(/Nenhuma tecnologia reconhecida nas Competências/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Resumo do período' })).toHaveTextContent('—Taxa');
  });
});

describe('peças', () => {
  it('período, dias, semana e linha de stack', () => {
    expect(periodFromParam('30')).toBe(30);
    expect(periodFromParam('tudo')).toBe(0);
    expect(periodFromParam(null)).toBe(90);
    expect(periodFromParam('7')).toBe(90);
    expect(formatDays(0.4)).toBe('menos de 1 dia');
    expect(formatDays(1)).toBe('1 dia');
    expect(formatDays(4.5)).toBe('4,5 dias');
    expect(weekLabel('2026-10-05')).toBe('05/10');
    expect(stackRow({ name: 'java', jobs: 1, share: 0.333, inResume: true })).toMatchObject({
      text: '1 vaga · 33%',
      badge: 'no currículo',
    });
    expect(
      stackRow({ name: 'java', jobs: 1, share: 0.333, inResume: true }, false).badge,
    ).toBeUndefined();
  });
});
