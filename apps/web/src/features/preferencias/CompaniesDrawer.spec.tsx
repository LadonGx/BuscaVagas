import type {
  AddCompanyInput,
  CompanyDirectoryDto,
  DirectoryCompanyDto,
  SourceInfoDto,
  TrackedCompanyDto,
} from '@busca-vagas/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, reply } from '../../test/api-mock';
import { layoutRoutes, preferences, source } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { addedMessage, companyStatus, filterDirectory } from './CompaniesDrawer';

const company = (overrides: Partial<TrackedCompanyDto> = {}): TrackedCompanyDto => ({
  id: 'c-1',
  source: 'greenhouse',
  slug: 'vtex',
  name: 'VTEX',
  displayName: 'VTEX',
  active: true,
  boardUrl: 'https://job-boards.greenhouse.io/vtex',
  lastCheckedAt: new Date(Date.now() - 2 * 3_600_000 - 60_000).toISOString(),
  lastStatus: 'ok',
  lastJobs: 28,
  lastMatched: 17,
  lastError: null,
  createdAt: '2026-10-12T12:00:00.000Z',
  ...overrides,
});

const entry = (overrides: Partial<DirectoryCompanyDto> = {}): DirectoryCompanyDto => ({
  source: 'greenhouse',
  slug: 'stone',
  name: 'Stone',
  segment: 'pagamentos',
  region: 'br',
  boardUrl: 'https://job-boards.greenhouse.io/stone',
  trackedId: null,
  ...overrides,
});

const board = (id: string, displayName: string, tracked: number): SourceInfoDto =>
  source({
    id,
    displayName,
    kind: 'company-board',
    active: tracked > 0,
    reason: tracked > 0 ? null : 'Nenhuma empresa acompanhada',
    trackedCompanies: tracked,
    lastRun: null,
  });

type Call = { method: string; path: string; body?: unknown };

/** API com estado: adicionar, ligar/desligar e remover mudam a lista. */
function setup(initial: TrackedCompanyDto[] = []) {
  let list = [...initial];
  const calls: Call[] = [];
  const body = (init: RequestInit) => (init.body ? JSON.parse(String(init.body)) : undefined);
  const directory = (): CompanyDirectoryDto => ({
    verifiedAt: '2026-10-12',
    companies: [
      entry(),
      entry({ slug: 'vtex', name: 'VTEX', segment: 'e-commerce (SaaS)' }),
      entry({
        source: 'ashby',
        slug: 'supabase',
        name: 'Supabase',
        segment: 'banco de dados',
        region: 'remote',
      }),
    ].map((item) => ({
      ...item,
      trackedId: list.find((c) => c.source === item.source && c.slug === item.slug)?.id ?? null,
    })),
  });

  mockApi({
    ...layoutRoutes(),
    'GET /discovery/sources': () => [
      source(),
      board('greenhouse', 'Greenhouse', list.filter((c) => c.source === 'greenhouse').length),
      board('lever', 'Lever', 0),
      board('ashby', 'Ashby', list.filter((c) => c.source === 'ashby').length),
    ],
    'GET /preferences': () => preferences(),
    'GET /preferences/stacks': () => [],
    'GET /maintenance/retention': () => ({
      enabled: false,
      days: 0,
      cutoff: null,
      dismissed: 0,
      stale: 0,
      sourceRuns: 0,
      forgottenExpired: 0,
      dryRun: true,
    }),
    'GET /companies': () => list,
    'GET /companies/directory': directory,
    'POST /companies': (_url, init) => {
      const input = body(init) as AddCompanyInput;
      calls.push({ method: 'POST', path: '/companies', body: input });
      if (input.url?.includes('linkedin')) {
        return reply(400, { statusCode: 400, message: 'Não reconheci o link.' });
      }
      const slug = input.slug ?? input.url!.split('/').filter(Boolean).at(-1)!;
      const added = company({
        id: `c-${slug}`,
        source: input.source ?? 'lever',
        slug,
        name: input.name ?? 'Stark Bank',
        displayName: input.name ?? 'Stark Bank',
        lastJobs: 6,
        lastMatched: 5,
        lastCheckedAt: new Date().toISOString(),
      });
      list = [...list, added];
      return { company: added, jobsNew: 4 };
    },
    'PATCH /companies/:id': (_url, init, params) => {
      calls.push({ method: 'PATCH', path: `/companies/${params.id}`, body: body(init) });
      list = list.map((c) => (c.id === params.id ? { ...c, ...body(init) } : c));
      return list.find((c) => c.id === params.id);
    },
    'POST /companies/:id/check': (_url, _init, params) => {
      calls.push({ method: 'POST', path: `/companies/${params.id}/check` });
      list = list.map((c) =>
        c.id === params.id ? { ...c, lastMatched: 20, lastCheckedAt: new Date().toISOString() } : c,
      );
      return list.find((c) => c.id === params.id);
    },
    'DELETE /companies/:id': (_url, _init, params) => {
      calls.push({ method: 'DELETE', path: `/companies/${params.id}` });
      list = list.filter((c) => c.id !== params.id);
      return new Response(null, { status: 204 });
    },
  });

  return { calls };
}

async function openDrawer() {
  const user = userEvent.setup();
  renderApp('/preferencias');
  const sources = await screen.findByRole('region', { name: 'Fontes' });
  await user.click(await within(sources).findByRole('button', { name: 'Empresas acompanhadas' }));
  const drawer = await screen.findByRole('dialog', { name: 'Empresas acompanhadas' });
  return { user, drawer };
}

describe('Empresas acompanhadas', () => {
  it('lista vazia leva ao diretório; "Acompanhar" adiciona e marca "Na lista"', async () => {
    const { calls } = setup();
    const { user, drawer } = await openDrawer();

    expect(await within(drawer).findByText('Nenhuma empresa ainda.')).toBeInTheDocument();
    await user.click(within(drawer).getByRole('button', { name: 'Ver o diretório' }));

    const tab = within(drawer).getByRole('tab', { name: 'Diretório' });
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(
      await within(drawer).findByText(/3 empresas conferidas em 12\/10\/2026/),
    ).toBeInTheDocument();

    // Filtro por origem e busca sem acento.
    await user.click(within(drawer).getByRole('button', { name: 'De fora, remoto' }));
    expect(within(drawer).getAllByRole('listitem')).toHaveLength(1);
    await user.click(within(drawer).getByRole('button', { name: 'Todas' }));
    await user.type(
      within(drawer).getByRole('searchbox', { name: 'Buscar no diretório' }),
      'pagamen',
    );
    expect(within(drawer).getAllByRole('listitem')).toHaveLength(1);

    await user.click(within(drawer).getByRole('button', { name: 'Acompanhar Stone' }));
    expect(calls).toContainEqual({
      method: 'POST',
      path: '/companies',
      body: { source: 'greenhouse', slug: 'stone', name: 'Stone' },
    });
    expect(
      await screen.findByText(
        /Stone adicionada · 5 de 6 vagas passam nos filtros \(4 novas na caixa\)/,
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(within(drawer).getByText('Na lista')).toBeInTheDocument());

    // A aba da lista mostra a contagem.
    expect(within(drawer).getByRole('tab', { name: /Minha lista\s*1/ })).toBeInTheDocument();
  });

  it('adiciona pelo link; link desconhecido mostra o motivo no campo', async () => {
    const { calls } = setup();
    const { user, drawer } = await openDrawer();

    const input = within(drawer).getByRole('textbox', { name: 'Adicionar pelo link' });
    const add = within(drawer).getByRole('button', { name: 'Adicionar' });
    expect(add).toBeDisabled();

    await user.type(input, 'https://www.linkedin.com/company/acme');
    await user.click(add);
    expect(await within(drawer).findByText('Não reconheci o link.')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');

    await user.clear(input);
    expect(input).not.toHaveAttribute('aria-invalid');
    await user.type(input, 'https://jobs.lever.co/starkbank{Enter}');
    expect(calls.at(-1)).toEqual({
      method: 'POST',
      path: '/companies',
      body: { url: 'https://jobs.lever.co/starkbank' },
    });
    expect(await within(drawer).findByText('Stark Bank')).toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(within(drawer).getByRole('region', { name: 'Lever' })).toHaveTextContent(
      '6 vagas no board, 5 passam nos filtros',
    );
  });

  it('lista por board: estado de cada empresa, liga/desliga, conferir e remover', async () => {
    const { calls } = setup([
      company(),
      company({
        id: 'c-2',
        slug: 'sumiu',
        name: null,
        displayName: 'Sumiu',
        lastStatus: 'not_found',
        lastJobs: 0,
        lastMatched: 0,
        lastError: 'HTTP 404',
      }),
      company({
        id: 'c-3',
        source: 'ashby',
        slug: 'supabase',
        name: 'Supabase',
        displayName: 'Supabase',
        lastCheckedAt: null,
        lastStatus: null,
        lastJobs: null,
        lastMatched: null,
      }),
    ]);
    const { user, drawer } = await openDrawer();

    const greenhouse = await within(drawer).findByRole('region', { name: 'Greenhouse' });
    expect(greenhouse).toHaveTextContent('2 empresas');
    expect(greenhouse).toHaveTextContent('28 vagas no board, 17 passam nos filtros · há 2 h');
    expect(greenhouse).toHaveTextContent(
      'Não encontrada (404) há 2 h: o link mudou ou a empresa saiu do Greenhouse',
    );
    expect(within(greenhouse).getByRole('link', { name: /vtex/ })).toHaveAttribute(
      'href',
      'https://job-boards.greenhouse.io/vtex',
    );
    expect(within(drawer).getByRole('region', { name: 'Ashby' })).toHaveTextContent(
      'Ainda não lida — entra na próxima busca',
    );

    const toggle = within(greenhouse).getByRole('switch', { name: 'Buscar vagas da VTEX' });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(calls).toContainEqual({
      method: 'PATCH',
      path: '/companies/c-1',
      body: { active: false },
    });
    await waitFor(() => expect(greenhouse).toHaveTextContent('1 de 2 ligadas'));
    expect(greenhouse).toHaveTextContent('Desligada · 28 vagas');

    await user.click(within(greenhouse).getByRole('button', { name: 'Ler o board da VTEX agora' }));
    await waitFor(() => expect(greenhouse).toHaveTextContent('20 passam nos filtros'));

    await user.click(within(greenhouse).getByRole('button', { name: 'Remover Sumiu' }));
    const confirm = within(greenhouse).getByRole('group', { name: 'Remover Sumiu?' });
    await user.click(within(confirm).getByRole('button', { name: 'Sim, remover' }));
    expect(calls).toContainEqual({ method: 'DELETE', path: '/companies/c-2' });
    await waitFor(() => expect(within(drawer).queryByText('Sumiu')).not.toBeInTheDocument());

    for (const button of within(drawer).getAllByRole('button')) {
      expect(button).toHaveAccessibleName();
    }
  });

  it('abas pelo teclado', async () => {
    setup();
    const { user, drawer } = await openDrawer();
    const lista = within(drawer).getByRole('tab', { name: /Minha lista/ });
    lista.focus();
    await user.keyboard('{ArrowRight}');
    const diretorio = within(drawer).getByRole('tab', { name: 'Diretório' });
    expect(diretorio).toHaveFocus();
    expect(diretorio).toHaveAttribute('aria-selected', 'true');
    expect(within(drawer).getByRole('tabpanel', { name: 'Diretório' })).toBeInTheDocument();
  });
});

describe('peças das empresas', () => {
  it('estado da empresa', () => {
    const now = new Date();
    expect(companyStatus(company({ lastMatched: 1, lastJobs: 1 }), 'Greenhouse', now).text).toMatch(
      /^1 vaga no board, 1 passa nos filtros · há 2 h$/,
    );
    expect(
      companyStatus(company({ lastStatus: 'failed', lastError: 'HTTP 503' }), 'Lever', now),
    ).toEqual({ text: 'Falhou há 2 h: HTTP 503', tone: 'bad' });
  });

  it('mensagem ao adicionar', () => {
    expect(addedMessage(company(), 0)).toBe('VTEX adicionada · 17 de 28 vagas passam nos filtros.');
  });

  it('diretório: filtra por origem e busca por nome ou área, sem acento', () => {
    const list = [
      entry({ name: 'Zeta', segment: 'jogos' }),
      entry({ name: 'Árvore', segment: 'imóveis', region: 'remote' }),
    ];
    expect(filterDirectory(list, '', 'all').map((c) => c.name)).toEqual(['Árvore', 'Zeta']);
    expect(filterDirectory(list, 'imoveis', 'all').map((c) => c.name)).toEqual(['Árvore']);
    expect(filterDirectory(list, '', 'br').map((c) => c.name)).toEqual(['Zeta']);
  });
});
