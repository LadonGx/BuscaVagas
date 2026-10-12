import type {
  JobCountsDto,
  PreferencesDto,
  PreferencesValues,
  ResumeStacksDto,
  RetentionReportDto,
  SourceRunDto,
} from '@busca-vagas/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi } from '../../test/api-mock';
import { counts, layoutRoutes, preferences, run } from '../../test/fixtures';
import { renderApp } from '../../test/render';

type Call = { method: string; path: string; body?: unknown; query?: string };

const retention = (overrides: Partial<RetentionReportDto> = {}): RetentionReportDto => ({
  enabled: true,
  days: 30,
  cutoff: '2026-09-12T00:00:00.000Z',
  dismissed: 12,
  stale: 31,
  sourceRuns: 4,
  forgottenExpired: 0,
  dryRun: true,
  ...overrides,
});

/** API com estado: o PUT sobe a versão e põe as notas na fila. */
function setup({
  rescoreQueued = true,
  resumeStacks = {
    scannedSections: ['Competências'],
    stacks: [
      { name: 'react', sections: ['Competências'] },
      { name: 'docker', sections: ['Competências'] },
      { name: 'java', sections: ['Competências'] },
    ],
  } as ResumeStacksDto,
} = {}) {
  let prefs: PreferencesDto = {
    ...preferences(),
    stacksCore: ['node.js', 'react'],
    seniorities: ['junior'],
  };
  let pending = 0;
  /** Quantas leituras das contagens ainda veem a fila cheia. */
  let pendingReads = 0;
  let report = retention();
  const calls: Call[] = [];
  const body = (init: RequestInit) => (init.body ? JSON.parse(String(init.body)) : undefined);

  const runs = Array.from({ length: 25 }, (_, index) =>
    run({ id: `run-${index}`, jobsFound: 100 + index, jobsNew: index }),
  );

  mockApi({
    ...layoutRoutes(),
    'GET /preferences': () => prefs,
    'PUT /preferences': (_u, init) => {
      const input = body(init) as PreferencesValues;
      calls.push({ method: 'PUT', path: '/preferences', body: input });
      prefs = { ...prefs, ...input, version: prefs.version + 1, configured: true };
      pending = 35;
      pendingReads = 2;
      return { ...prefs, rescoreQueued };
    },
    'GET /jobs/counts': (): JobCountsDto => {
      const result = counts({
        score: { great: 42, good: 61, weak: 20, incompatible: 18, pending, unscored: 0 },
      });
      // A fila termina depois de algumas leituras.
      pendingReads -= 1;
      if (pendingReads <= 0) pending = 0;
      return result;
    },
    'GET /preferences/stacks': () => [
      { name: 'react', known: true, jobs: 13 },
      { name: 'node.js', known: true, jobs: 9 },
      { name: 'docker', known: true, jobs: 5 },
      { name: 'react native', known: true, jobs: 4 },
      { name: 'php', known: true, jobs: 2 },
    ],
    'GET /resume/stacks': () => resumeStacks,
    'GET /maintenance/retention': () => report,
    'POST /maintenance/retention': () => {
      calls.push({ method: 'POST', path: '/maintenance/retention' });
      const done = { ...report, dryRun: false };
      report = retention({ dismissed: 0, stale: 0, sourceRuns: 0 });
      return done;
    },
    'GET /discovery/runs': (url) => {
      calls.push({ method: 'GET', path: '/discovery/runs', query: url.search });
      const start = Number(url.searchParams.get('cursor') ?? 0);
      const source = url.searchParams.get('sourceId');
      const list = source ? runs.slice(0, 2) : runs;
      const items: SourceRunDto[] = list.slice(start, start + 20);
      return { items, nextCursor: start + 20 < list.length ? String(start + 20) : null };
    },
  });

  return { calls };
}

async function openPage() {
  const user = userEvent.setup();
  const app = renderApp('/preferencias');
  await screen.findByRole('form', { name: 'Preferências' });
  return { user, ...app };
}

const saveButton = () => screen.getByRole('button', { name: /^Salvar e recalcular$|^Salvando/ });

describe('Preferências', () => {
  it('mostra o formulário, a prévia, as fontes e a limpeza — tudo com nome', async () => {
    setup();
    await openPage();

    const principais = screen.getByRole('list', { name: 'Principais' });
    expect(
      within(principais)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['node.js', 'react', '']);
    expect(screen.getByRole('button', { name: 'Júnior' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Pleno' })).toHaveAttribute('aria-pressed', 'false');

    const preview = screen.getByRole('region', { name: 'Com estas preferências' });
    expect(await within(preview).findByText('42')).toBeInTheDocument();
    expect(preview).toHaveTextContent('61600–799');
    expect(preview).toHaveTextContent('18incompatíveis');
    expect(saveButton()).toBeDisabled();

    const sources = screen.getByRole('region', { name: 'Fontes' });
    expect(await within(sources).findByText('Greenhouse')).toBeInTheDocument();
    expect(sources).toHaveTextContent('Parada · nenhuma empresa na lista');
    expect(
      within(sources).getByRole('button', { name: 'Empresas acompanhadas' }),
    ).toBeInTheDocument();
    expect(sources).toHaveTextContent('387 vagas');

    const cleanup = screen.getByRole('region', { name: 'Limpeza (30 dias)' });
    expect(
      await within(cleanup).findByText(
        'Na próxima limpeza saem 12 descartadas e 31 esquecidas na caixa.',
      ),
    ).toBeInTheDocument();

    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAccessibleName();
    }
  });

  it('salva tudo de uma vez e acompanha o recálculo das notas', async () => {
    const { calls } = setup();
    const { user } = await openPage();

    await user.click(screen.getByRole('button', { name: 'Pleno' }));
    await user.click(screen.getByRole('button', { name: 'Remota' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Cidades para híbrido ou presencial' }),
      'Campinas{Enter}',
    );
    await user.type(screen.getByLabelText('Idade máxima da vaga'), '30');
    await user.type(screen.getByLabelText('Salário mínimo'), '3000');
    const companies = screen.getByRole('textbox', { name: 'Empresas' });
    await user.click(companies);
    await user.paste('Acme, Beta Ltda, acme');

    expect(screen.getByText(/6 alterações não salvas/)).toBeInTheDocument();
    await user.click(saveButton());

    expect(
      await screen.findByText('Preferências salvas. Recalculando as notas…'),
    ).toBeInTheDocument();
    expect(calls[0]).toEqual({
      method: 'PUT',
      path: '/preferences',
      body: {
        stacksCore: ['node.js', 'react'],
        stacksPlus: [],
        stacksAvoid: [],
        seniorities: ['junior', 'mid'],
        workModels: ['remote'],
        cities: ['Campinas'],
        contractTypes: [],
        maxAgeDays: 30,
        minMonthlySalary: 3000,
        blockedCompanies: ['Acme', 'Beta Ltda'],
      },
    });

    // As contagens voltam com a fila cheia e depois zeram (polling de 3 s).
    expect(await screen.findByText('Recalculando notas… faltam 35')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Recalculando notas/)).not.toBeInTheDocument(), {
      timeout: 5_000,
    });
    // O formulário recomeçou do que a API guardou: nada pendente.
    expect(saveButton()).toBeDisabled();
  }, 10_000);

  it('a mesma tecnologia fica num grupo só: adicionar noutro move', async () => {
    const { calls } = setup();
    const { user } = await openPage();

    await user.type(screen.getByRole('combobox', { name: 'Adicionar em Evitar' }), 'React{Enter}');
    expect(screen.getByText('"react" foi para Evitar e saiu de Principais.')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Evitar' })).toHaveTextContent('react');
    expect(screen.getByRole('list', { name: 'Principais' })).not.toHaveTextContent('react');

    await user.click(screen.getByRole('button', { name: 'Tirar node.js de Principais' }));
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toMatchObject({ stacksCore: [], stacksAvoid: ['react'] });
  });

  it('avisa quando o detector não conhece a tecnologia', async () => {
    setup();
    const { user } = await openPage();

    await screen.findByText('42');
    await user.type(
      screen.getByRole('combobox', { name: 'Adicionar em Ganham pontos' }),
      'cobol{Enter}',
    );
    expect(
      screen.getByText(/O detector ainda não conhece cobol: nenhuma vaga vai citar esse nome/),
    ).toBeInTheDocument();
  });

  it('número fora da faixa não salva e o erro aparece no campo', async () => {
    const { calls } = setup();
    const { user } = await openPage();

    await user.type(screen.getByLabelText('Idade máxima da vaga'), '400');
    await user.click(saveButton());

    expect(
      screen.getByText('Use de 1 a 365 dias, ou deixe vazio para desligar.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Idade máxima da vaga')).toHaveAttribute('aria-invalid', 'true');
    expect(calls).toEqual([]);

    fireEvent.change(screen.getByLabelText('Idade máxima da vaga'), { target: { value: '45' } });
    expect(screen.queryByText(/Use de 1 a 365 dias/)).not.toBeInTheDocument();
  });

  it('fila das notas fora do ar: salva, mas avisa', async () => {
    setup({ rescoreQueued: false });
    const { user } = await openPage();

    await user.click(screen.getByRole('button', { name: 'Pleno' }));
    await user.click(saveButton());
    expect(
      await screen.findByText(/Preferências salvas, mas a fila das notas não respondeu/),
    ).toBeInTheDocument();
  });

  it('histórico de buscas: carrega mais e filtra por fonte', async () => {
    const { calls } = setup();
    const { user } = await openPage();

    await user.click(screen.getByRole('button', { name: 'Ver histórico de buscas' }));
    const drawer = await screen.findByRole('dialog', { name: 'Histórico de buscas' });
    await within(drawer).findByText('100 encontradas · 0 novas');
    expect(within(drawer).getAllByRole('listitem')).toHaveLength(20);

    await user.click(within(drawer).getByRole('button', { name: 'Carregar mais' }));
    await waitFor(() => expect(within(drawer).getAllByRole('listitem')).toHaveLength(25));
    expect(within(drawer).queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument();

    await user.selectOptions(within(drawer).getByLabelText('Fonte'), 'gupy');
    await waitFor(() => expect(within(drawer).getAllByRole('listitem')).toHaveLength(2));
    expect(calls.at(-1)?.query).toContain('sourceId=gupy');
  });

  it('"Limpar agora" diz o que vai apagar e só apaga depois de confirmar', async () => {
    const { calls } = setup();
    const { user } = await openPage();

    const cleanup = screen.getByRole('region', { name: 'Limpeza (30 dias)' });
    await user.click(await within(cleanup).findByRole('button', { name: 'Limpar agora' }));

    const confirm = within(cleanup).getByRole('alertdialog');
    expect(confirm).toHaveTextContent('Vai apagar agora, sem como desfazer:');
    expect(confirm).toHaveTextContent(
      '12 vagas descartadas há mais de 30 dias — não voltam nas próximas buscas.',
    );
    expect(confirm).toHaveTextContent(
      '31 vagas da caixa de entrada que a fonte não mostra há mais de 30 dias',
    );
    expect(confirm).toHaveTextContent('4 registros do histórico de buscas com mais de 30 dias.');
    expect(confirm).toHaveTextContent('Salvas e vagas com candidatura ficam.');
    expect(calls).toEqual([]);

    await user.click(within(confirm).getByRole('button', { name: 'Cancelar' }));
    expect(within(cleanup).queryByRole('alertdialog')).not.toBeInTheDocument();

    await user.click(within(cleanup).getByRole('button', { name: 'Limpar agora' }));
    await user.click(within(cleanup).getByRole('button', { name: 'Apagar agora' }));
    expect(
      await screen.findByText('Limpeza feita: 12 descartadas e 31 esquecidas apagadas.'),
    ).toBeInTheDocument();
    expect(calls).toEqual([{ method: 'POST', path: '/maintenance/retention' }]);
    expect(
      await within(cleanup).findByText('Nenhuma vaga para sair na próxima limpeza.'),
    ).toBeInTheDocument();
  });

  it('sugestões: lista própria, já sem o que está no grupo, com teclado e clique', async () => {
    const { calls } = setup();
    const { user } = await openPage();

    const input = screen.getByRole('combobox', { name: 'Adicionar em Ganham pontos' });
    await user.click(input);
    const list = await screen.findByRole('listbox', {
      name: 'Sugestões: Adicionar em Ganham pontos',
    });
    const names = () =>
      within(list)
        .getAllByRole('option')
        .map((o) => o.textContent);
    expect(names()).toEqual([
      'reactjá em Principais13 vagas',
      'node.jsjá em Principais9 vagas',
      'docker5 vagas',
      'react native4 vagas',
      'php2 vagas',
    ]);

    // Filtra: quem começa com o texto vem antes.
    await user.type(input, 're');
    expect(names()).toEqual(['reactjá em Principais13 vagas', 'react native4 vagas']);
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(input).toHaveAttribute(
      'aria-activedescendant',
      within(list).getAllByRole('option')[1]!.id,
    );
    await user.keyboard('{Enter}');
    expect(screen.getByRole('list', { name: 'Ganham pontos' })).toHaveTextContent('react native');

    // Clique numa sugestão que está noutro grupo: move.
    await user.click(input);
    await user.click(within(list).getByRole('option', { name: /^php/ }));
    expect(screen.getByRole('list', { name: 'Ganham pontos' })).toHaveTextContent('php');

    await user.keyboard('{Escape}');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(calls).toEqual([]);
  });

  it('"Trazer do currículo": marca o que é novo e manda para o grupo escolhido', async () => {
    const { calls } = setup();
    const { user } = await openPage();

    await user.click(screen.getByRole('button', { name: 'Trazer do currículo' }));
    const panel = await screen.findByRole('group', { name: /Tecnologias do currículo/ });
    expect(panel).toHaveTextContent('procurei em Competências');
    const react = within(panel).getByRole('checkbox', { name: /react/ });
    expect(react).not.toBeChecked();
    expect(within(panel).getByText('já em Principais')).toBeInTheDocument();
    expect(within(panel).getByRole('checkbox', { name: 'docker' })).toBeChecked();

    await user.click(within(panel).getByRole('checkbox', { name: 'java' }));
    await user.click(
      within(panel).getByRole('button', { name: 'Adicionar marcadas em Ganham pontos' }),
    );

    expect(
      screen.queryByRole('group', { name: /Tecnologias do currículo/ }),
    ).not.toBeInTheDocument();
    const plus = screen.getByRole('list', { name: 'Ganham pontos' });
    expect(plus).toHaveTextContent('docker');
    expect(plus).not.toHaveTextContent('java');
    expect(
      screen.getByText('1 tecnologia do currículo foi para Ganham pontos. Salve para valer.'),
    ).toBeInTheDocument();
    // Só no rascunho: nada foi gravado.
    expect(calls).toEqual([]);
    expect(saveButton()).toBeEnabled();
  });

  it('"Trazer do currículo" com a tecnologia noutro grupo: move e avisa', async () => {
    setup();
    const { user } = await openPage();

    await user.click(screen.getByRole('button', { name: 'Trazer do currículo' }));
    const panel = await screen.findByRole('group', { name: /Tecnologias do currículo/ });
    await user.click(within(panel).getByRole('checkbox', { name: /react/ }));
    await user.click(within(panel).getByRole('checkbox', { name: 'docker' }));
    await user.click(within(panel).getByRole('checkbox', { name: 'java' }));
    await user.click(
      within(panel).getByRole('button', { name: 'Adicionar marcadas em Ganham pontos' }),
    );

    expect(screen.getByRole('list', { name: 'Principais' })).not.toHaveTextContent('react');
    expect(
      screen.getByText(
        '1 tecnologia do currículo foi para Ganham pontos (1 saiu de outro grupo). Salve para valer.',
      ),
    ).toBeInTheDocument();
  });

  it('"Trazer do currículo" sem nada reconhecido aponta para o Currículo', async () => {
    setup({ resumeStacks: { scannedSections: ['Competências'], stacks: [] } });
    const { user } = await openPage();

    await user.click(screen.getByRole('button', { name: 'Trazer do currículo' }));
    expect(await screen.findByText(/Nenhuma tecnologia reconhecida/)).toBeInTheDocument();
    const panel = screen.getByRole('group', { name: /Tecnologias do currículo/ });
    expect(within(panel).getByRole('link', { name: 'Currículo' })).toHaveAttribute(
      'href',
      '/curriculo',
    );
    expect(screen.queryByRole('button', { name: /Adicionar marcadas/ })).not.toBeInTheDocument();
  });
});
