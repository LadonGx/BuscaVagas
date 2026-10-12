import type { DashboardDto, ResumeDto } from '@busca-vagas/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi } from '../../test/api-mock';
import {
  dashboard,
  inactiveBoard,
  job,
  layoutRoutes,
  preferences,
  resume,
  source,
} from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { dayLabel, funnelRows, niceMax } from './Charts';
import { resumeStarted } from './InicioPage';
import { firstSteps, stepWhen } from './Lists';

const emptyResume = (): ResumeDto => ({
  sections: resume()
    .sections.map((section) => ({
      ...section,
      items: section.items.map((item) => ({
        ...item,
        data:
          section.kind === 'fields'
            ? { label: (item.data as { label: string }).label, value: '' }
            : section.kind === 'text'
              ? { text: '' }
              : item.data,
      })),
    }))
    .filter((section) => section.kind !== 'entries'),
});

function setup({
  data = dashboard(),
  configured = true,
  resumeData = resume(),
  searched = true,
}: {
  data?: DashboardDto;
  configured?: boolean;
  resumeData?: ResumeDto;
  searched?: boolean;
} = {}) {
  mockApi({
    ...layoutRoutes(),
    'GET /dashboard': () => data,
    'GET /preferences': () => preferences(configured),
    'GET /resume': () => resumeData,
    'GET /discovery/sources': () =>
      searched ? [source(), inactiveBoard()] : [source({ lastRun: null }), inactiveBoard()],
    'GET /jobs/:id': () => job(),
  });
}

async function openPage() {
  const user = userEvent.setup();
  const app = renderApp('/');
  await screen.findByRole('heading', { name: 'Esta semana' });
  return { user, ...app };
}

describe('Início', () => {
  it('mostra atalhos, a semana, as listas, o gráfico e o funil — tudo com nome', async () => {
    setup();
    await openPage();

    expect(screen.getByText(/2 vagas novas desde ontem/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Triar no deslizar\s*87 na caixa/ })).toHaveAttribute(
      'href',
      '/deslizar',
    );
    expect(screen.getByRole('link', { name: /Ver vagas\s*18 salvas/ })).toHaveAttribute(
      'href',
      '/vagas?aba=salvas',
    );

    const week = screen.getByRole('region', { name: 'Esta semana' });
    expect(week).toHaveTextContent('2Vagas novasnas últimas 24 h');
    expect(week).toHaveTextContent('6Nota ≥ 800na caixa de entrada');
    expect(week).toHaveTextContent('2Etapas marcadasnos próximos 7 dias');
    expect(await within(week).findByText('Proposta')).toBeInTheDocument();

    const top = screen.getByRole('region', { name: 'Melhores vagas novas' });
    expect(within(top).getByRole('button', { name: /Full Stack Júnior/ })).toBeInTheDocument();

    const steps = screen.getByRole('region', { name: 'Próximas etapas' });
    expect(within(steps).getByRole('link', { name: /Entrevista técnica/ })).toHaveAttribute(
      'href',
      '/candidaturas/app-1',
    );

    // Gráfico: o pico tem número; a tabela leva todos os dias.
    const chart = screen.getByRole('img', { name: /Vagas novas por dia nos últimos 14 dias/ });
    expect(chart).toHaveAccessibleName(/40 vagas novas no total, pico de 9/);
    expect(screen.getByRole('table', { name: 'Vagas novas por dia' })).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(15);

    const funnel = screen.getByRole('region', { name: 'Funil das candidaturas' });
    expect(funnel).toHaveTextContent('3 · 33% da etapa anterior');
    expect(funnel).toHaveTextContent('1 · 33% da etapa anterior');
    expect(funnel).toHaveTextContent('4,5 dias (mediana)');

    // Tudo feito: sem "Primeiros passos".
    expect(screen.queryByRole('region', { name: 'Primeiros passos' })).not.toBeInTheDocument();

    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAccessibleName();
    }
  });

  it('clicar numa vaga abre o painel pela URL, como em Vagas', async () => {
    setup();
    const { user, router } = await openPage();

    await user.click(screen.getByRole('button', { name: /Full Stack Júnior/ }));
    expect(router.state.location.search).toBe('?vaga=job-1');
    expect(await screen.findByRole('dialog', { name: /Full Stack Júnior/ })).toBeInTheDocument();
  });

  it('gráfico pelo teclado: setas mostram cada dia', async () => {
    setup();
    const { user } = await openPage();

    const chart = screen.getByRole('img', { name: /Vagas novas por dia/ });
    chart.focus();
    await user.keyboard('{ArrowLeft}');
    const last = dashboard().newJobsPerDay.at(-1)!;
    await waitFor(() =>
      expect(screen.getByText(`${dayLabel(last.date).long}: 2 vagas novas`)).toBeInTheDocument(),
    );
  });

  it('sem preferências: a nota mostra "—" e leva para Preferências', async () => {
    setup({ configured: false });
    await openPage();

    const week = screen.getByRole('region', { name: 'Esta semana' });
    await waitFor(() => expect(week).toHaveTextContent('—Nota ≥ 800'));
    expect(within(week).getByRole('link', { name: 'configure as preferências' })).toHaveAttribute(
      'href',
      '/preferencias',
    );
  });

  it('primeiros passos: aparece enquanto falta algo e marca o que já foi feito', async () => {
    setup({ configured: false, resumeData: emptyResume(), searched: true });
    await openPage();

    const card = await screen.findByRole('region', { name: 'Primeiros passos' });
    expect(card).toHaveTextContent('1 de 3 feitos');
    expect(within(card).getByText(/Fazer a primeira busca/)).toHaveTextContent('(feito)');
    expect(within(card).getByRole('link', { name: 'Salvar as preferências' })).toHaveAttribute(
      'href',
      '/preferencias',
    );
    expect(within(card).getByRole('link', { name: 'Preencher o currículo' })).toHaveAttribute(
      'href',
      '/curriculo',
    );
  });

  it('sem dados: listas e funil dizem o que fazer', async () => {
    setup({
      data: dashboard({
        newJobsPerDay: dashboard().newJobsPerDay.map((day) => ({ ...day, count: 0 })),
        topNew: [],
        upcomingSteps: [],
        funnel: { applied: 0, inProcess: 0, offer: 0 },
        medianDaysToFirstResponse: null,
      }),
    });
    await openPage();

    expect(screen.getByText(/Nenhuma vaga nova com nota nos últimos 7 dias/)).toBeInTheDocument();
    expect(screen.getByText(/Nenhuma etapa marcada/)).toBeInTheDocument();
    expect(screen.getByText('Nenhuma vaga nova nos últimos 14 dias.')).toBeInTheDocument();
    expect(screen.getByText(/Nenhuma candidatura ainda/)).toBeInTheDocument();
  });

  it('"Vaga manual" abre o mesmo diálogo da tela de Vagas', async () => {
    setup();
    const { user } = await openPage();

    await user.click(screen.getByRole('button', { name: /Vaga manual/ }));
    expect(await screen.findByRole('dialog', { name: /vaga/i })).toBeInTheDocument();
  });
});

describe('peças do Início', () => {
  it('eixo com passos redondos', () => {
    expect(niceMax(61)).toEqual({ top: 80, step: 20 });
    expect(niceMax(9)).toEqual({ top: 10, step: 5 });
    expect(niceMax(1)).toEqual({ top: 1, step: 1 });
    expect(niceMax(0)).toEqual({ top: 1, step: 1 });
  });

  it('funil: % da etapa anterior e largura pela primeira', () => {
    expect(funnelRows({ applied: 8, inProcess: 2, offer: 0 })).toMatchObject([
      { label: 'Aplicada', width: 100, share: null },
      { label: 'Em processo', width: 25, share: 25 },
      { label: 'Proposta', width: 0, share: 0 },
    ]);
    expect(funnelRows({ applied: 0, inProcess: 0, offer: 0 })[1]).toMatchObject({
      width: 0,
      share: null,
    });
  });

  it('dia da etapa: hoje, amanhã ou o dia da semana; hora só se marcada', () => {
    const now = new Date(2026, 9, 12, 10, 0);
    expect(stepWhen(new Date(2026, 9, 12, 14, 30).toISOString(), now)).toMatchObject({
      top: 'hoje',
      day: '12',
      time: '14:30',
    });
    expect(stepWhen(new Date(2026, 9, 13).toISOString(), now)).toMatchObject({
      top: 'amanhã',
      time: null,
    });
    expect(stepWhen(new Date(2026, 9, 15).toISOString(), now).top).toBe('qui');
  });

  it('currículo começado e primeiros passos', () => {
    expect(resumeStarted(resume())).toBe(true);
    expect(resumeStarted(emptyResume())).toBe(false);
    expect(firstSteps({ preferences: undefined, resumeStarted: true, searched: true })).toBeNull();
  });
});
