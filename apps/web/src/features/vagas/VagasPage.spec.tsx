import type { JobDto } from '@busca-vagas/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, reply } from '../../test/api-mock';
import { job, layoutRoutes } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { SEARCH_DEBOUNCE_MS } from './VagasToolbar';

const acme = job({ id: 'j1', title: 'Full Stack Júnior', company: 'Acme' });
const brisa = job({
  id: 'j2',
  title: 'Analista Pleno',
  company: 'Brisa',
  score: 418,
  scoreReasons: [{ criterion: 'stack', kind: 'minus', text: 'Nenhuma das suas stacks principais' }],
});

/**
 * API com estado: a triagem muda a vaga e a listagem filtra pela aba, como a
 * de verdade. Registra as chamadas.
 */
function setup(initial: JobDto[] = [acme, brisa], extra: Parameters<typeof mockApi>[0] = {}) {
  const items = initial.map((item) => ({ ...item }));
  const calls: { method: string; path: string; query: URLSearchParams; body?: unknown }[] = [];
  const fetch = mockApi({
    ...layoutRoutes(),
    'GET /jobs': (url) => {
      calls.push({ method: 'GET', path: '/jobs', query: url.searchParams });
      const triage = url.searchParams.get('triage');
      return {
        items: items.filter((item) => !triage || item.triage === triage),
        nextCursor: null,
      };
    },
    'GET /jobs/:id': (_url, _init, { id }) =>
      items.find((item) => item.id === id) ?? reply(404, {}),
    'PUT /jobs/:id/triage': (_url, init, { id }) => {
      const body = JSON.parse(String(init.body)) as { status: JobDto['triage'] };
      calls.push({ method: 'PUT', path: `/jobs/${id}/triage`, query: new URLSearchParams(), body });
      const target = items.find((item) => item.id === id);
      if (target) target.triage = body.status;
      return target;
    },
    ...extra,
  });
  const lastList = () => calls.filter((call) => call.method === 'GET').at(-1)?.query;
  return { calls, fetch, lastList };
}

const card = (title: string) => screen.getByRole('article', { name: title });

describe('Vagas', () => {
  it('mostra os cartões da caixa com nota, chips e motivos', async () => {
    const { lastList } = setup();
    renderApp('/vagas');

    const acmeCard = await screen.findByRole('article', { name: 'Full Stack Júnior' });
    expect(within(acmeCard).getByRole('img', { name: /Nota 912 de 1000/ })).toBeVisible();
    expect(within(acmeCard).getByText('Híbrida')).toBeVisible();
    expect(within(card('Analista Pleno')).getByText(/Nenhuma das suas stacks/)).toBeVisible();
    expect(lastList()?.get('triage')).toBe('inbox');
    // Caixa = só as vagas por olhar: com candidatura fica fora.
    expect(lastList()?.get('hasApplication')).toBe('false');
    expect(lastList()?.get('limit')).toBe('30');
    expect(screen.getByText('142 na caixa · ordenadas pela sua nota')).toBeVisible();
  });

  it('abas e filtros vão para a URL e para a busca', async () => {
    const { lastList } = setup();
    const { router } = renderApp('/vagas');
    await screen.findByRole('article', { name: 'Full Stack Júnior' });

    await userEvent.click(screen.getByRole('button', { name: /Com candidatura/ }));
    await waitFor(() => expect(lastList()?.get('hasApplication')).toBe('true'));
    expect(lastList()?.get('triage')).toBeNull();
    expect(router.state.location.search).toBe('?aba=candidatura');

    await userEvent.click(screen.getByRole('button', { name: 'Remota' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Nota mínima' }), '700');
    await waitFor(() => expect(lastList()?.get('minScore')).toBe('700'));
    expect(lastList()?.get('workModel')).toBe('remote');
    expect(router.state.location.search).toBe('?aba=candidatura&modelo=remote&nota=700');
  });

  it('busca espera parar de digitar', async () => {
    const { lastList } = setup();
    renderApp('/vagas');
    await screen.findByRole('article', { name: 'Full Stack Júnior' });

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar vagas' }), 'react');
    await waitFor(() => expect(lastList()?.get('q')).toBe('react'));
  });

  it('busca acompanha a URL: Voltar e links trocam o texto, sem reescrever o antigo', async () => {
    const { lastList } = setup();
    const { router } = renderApp('/vagas?busca=react');
    const search = await screen.findByRole('searchbox', { name: 'Buscar vagas' });
    expect(search).toHaveValue('react');

    // Link dentro do app para outra busca.
    await act(() => router.navigate('/vagas?busca=node'));
    expect(search).toHaveValue('node');
    await waitFor(() => expect(lastList()?.get('q')).toBe('node'));

    // Voltar.
    await act(() => router.navigate(-1));
    expect(search).toHaveValue('react');
    await new Promise((resolve) => setTimeout(resolve, SEARCH_DEBOUNCE_MS + 100));
    expect(router.state.location.search).toBe('?busca=react');
    expect(lastList()?.get('q')).toBe('react');

    // Digitar continua indo para a URL.
    await userEvent.type(search, ' native');
    await waitFor(() => expect(router.state.location.search).toBe('?busca=react+native'));
    expect(search).toHaveValue('react native');
  });

  it('salvar tira o cartão da caixa na hora e o desfazer volta para a caixa', async () => {
    const { calls } = setup();
    renderApp('/vagas');

    await userEvent.click(await screen.findByRole('button', { name: 'Salvar: Full Stack Júnior' }));
    await waitFor(() =>
      expect(screen.queryByRole('article', { name: 'Full Stack Júnior' })).not.toBeInTheDocument(),
    );
    expect(await screen.findByText('Vaga salva')).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(() =>
      expect(calls.filter((call) => call.method === 'PUT').map((call) => call.body)).toEqual([
        { status: 'saved' },
        { status: 'inbox' },
      ]),
    );
    expect(await screen.findByRole('article', { name: 'Full Stack Júnior' })).toBeVisible();
  });

  it('filtro de fonte: uma fonte, os alertas por e-mail juntos ou tudo menos e-mail', async () => {
    const { lastList } = setup();
    const { router } = renderApp('/vagas');
    await screen.findByRole('article', { name: 'Full Stack Júnior' });
    const select = screen.getByRole('combobox', { name: 'Fonte' });
    // As fontes vêm da API (Gupy, Greenhouse); os sites de e-mail e o manual são fixos.
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Gupy' })).toBeTruthy());
    expect(within(select).getByRole('option', { name: 'LinkedIn (e-mail)' })).toBeTruthy();

    await userEvent.selectOptions(select, 'Gupy');
    await waitFor(() => expect(lastList()?.get('source')).toBe('gupy'));
    expect(router.state.location.search).toBe('?fonte=gupy');

    await userEvent.selectOptions(select, 'Alertas por e-mail');
    await waitFor(() => expect(lastList()?.get('source')).toBe('linkedin,indeed,glassdoor'));

    await userEvent.selectOptions(select, 'Tudo menos e-mail');
    await waitFor(() => expect(lastList()?.get('excludeSource')).toBe('linkedin,indeed,glassdoor'));
    expect(lastList()?.get('source')).toBeNull();

    await userEvent.selectOptions(select, 'Qualquer fonte');
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('vaga de alerta por e-mail mostra o site de origem', async () => {
    const linkedin = job({
      id: 'j3',
      title: 'Dev Júnior',
      company: 'Wevy',
      source: 'linkedin',
      url: 'https://www.linkedin.com/jobs/view/4476236394',
    });
    setup([linkedin]);
    renderApp('/vagas');

    await userEvent.click(await screen.findByRole('button', { name: 'Dev Júnior' }));
    const dialog = await screen.findByRole('dialog', { name: 'Dev Júnior' });
    expect(within(dialog).getByText('Wevy · via LinkedIn')).toBeVisible();
  });

  it('erro da API devolve o cartão e avisa', async () => {
    setup([acme, brisa], {
      'PUT /jobs/:id/triage': () => reply(409, { message: 'Esta vaga tem uma candidatura.' }),
    });
    renderApp('/vagas');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Descartar: Full Stack Júnior' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta vaga tem uma candidatura.');
    expect(screen.getByRole('article', { name: 'Full Stack Júnior' })).toBeVisible();
  });

  it('painel abre pela URL com os motivos e descarta com motivo', async () => {
    const { calls } = setup();
    const { router } = renderApp('/vagas');

    await userEvent.click(await screen.findByRole('button', { name: 'Full Stack Júnior' }));
    const dialog = await screen.findByRole('dialog', { name: 'Full Stack Júnior' });
    expect(router.state.location.search).toBe('?vaga=j1');
    expect(within(dialog).getByText('Acme · via Gupy')).toBeVisible();
    expect(within(dialog).getByText(/3 de 4 principais/)).toBeVisible();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Descartar…' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Presencial' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Descartar' }));

    await waitFor(() =>
      expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({
        status: 'dismissed',
        reason: 'Presencial',
      }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(router.state.location.search).toBe('');
  });

  it('painel mostra o comando de preencher a candidatura; site restrito, não', async () => {
    const linkedin = job({
      id: 'j3',
      title: 'Dev LinkedIn',
      url: 'https://www.linkedin.com/jobs/view/1',
    });
    setup([acme, linkedin]);
    const user = userEvent.setup();
    const { router } = renderApp('/vagas?vaga=j1');

    const dialog = await screen.findByRole('dialog', { name: 'Full Stack Júnior' });
    const fill = within(dialog).getByRole('region', { name: 'Preencher a candidatura' });
    expect(within(fill).getByText('pnpm candidatar j1')).toBeVisible();
    await user.click(within(fill).getByRole('button', { name: 'Copiar o comando' }));
    expect(await navigator.clipboard.readText()).toBe('pnpm candidatar j1');

    await router.navigate('/vagas?vaga=j3');
    const other = await screen.findByRole('dialog', { name: 'Dev LinkedIn' });
    expect(within(other).getByText(/proíbe preenchimento automático/)).toBeVisible();
    expect(within(other).queryByText(/pnpm candidatar/)).not.toBeInTheDocument();
  });

  it('"Me candidatei" cria a candidatura', async () => {
    let posted: unknown;
    setup([acme, brisa], {
      'POST /applications': (_url, init) => {
        posted = JSON.parse(String(init.body));
        return { id: 'app-1', jobId: 'j1' };
      },
    });
    renderApp('/vagas?vaga=j1');

    const dialog = await screen.findByRole('dialog', { name: 'Full Stack Júnior' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Me candidatei' }));
    expect(await screen.findByText(/Candidatura registrada/)).toBeVisible();
    expect(posted).toEqual({ jobId: 'j1' });
  });

  it('vaga manual valida antes de enviar e envia o que foi preenchido', async () => {
    let posted: Record<string, unknown> | undefined;
    setup([acme], {
      'POST /jobs': (_url, init) => {
        posted = JSON.parse(String(init.body)) as Record<string, unknown>;
        return job({ id: 'novo', title: String(posted.title) });
      },
    });
    renderApp('/vagas');

    await userEvent.click(await screen.findByRole('button', { name: 'Vaga manual' }));
    const dialog = screen.getByRole('dialog', { name: 'Adicionar vaga' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Adicionar' }));
    expect(within(dialog).getAllByText('Preencha este campo.')).toHaveLength(2);
    expect(posted).toBeUndefined();

    await userEvent.type(within(dialog).getByRole('textbox', { name: /Título/ }), 'Dev Jr');
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Empresa/ }), 'Indicação SA');
    await userEvent.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Modalidade' }),
      'remote',
    );
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Stack' }), 'React, Node.js');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Adicionar' }));

    await waitFor(() => expect(posted).toBeDefined());
    expect(posted).toMatchObject({
      title: 'Dev Jr',
      company: 'Indicação SA',
      workModel: 'remote',
      stack: ['react', 'node.js'],
      url: null,
    });
    expect(await screen.findByText('Vaga "Dev Jr" adicionada à caixa.')).toBeVisible();
  });

  it('link repetido: a mensagem fica no formulário', async () => {
    setup([acme], { 'POST /jobs': () => reply(409, { message: 'Já existe' }) });
    renderApp('/vagas');

    await userEvent.click(await screen.findByRole('button', { name: 'Vaga manual' }));
    const dialog = screen.getByRole('dialog', { name: 'Adicionar vaga' });
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Título/ }), 'Dev');
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Empresa/ }), 'X');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Adicionar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Essa vaga já está no BuscaVagas',
    );
  });

  it('carregar mais usa o cursor', async () => {
    const cursors: (string | null)[] = [];
    mockApi({
      ...layoutRoutes(),
      'GET /jobs': (url) => {
        const cursor = url.searchParams.get('cursor');
        cursors.push(cursor);
        return cursor ? { items: [brisa], nextCursor: null } : { items: [acme], nextCursor: 'c1' };
      },
    });
    renderApp('/vagas');

    await userEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));
    expect(await screen.findByRole('article', { name: 'Analista Pleno' })).toBeVisible();
    expect(cursors).toEqual([null, 'c1']);
    expect(screen.getByText('2 vagas · fim da lista')).toBeVisible();
  });

  it('caixa vazia e filtros sem resultado têm mensagens diferentes', async () => {
    setup([]);
    const { router } = renderApp('/vagas');
    expect(await screen.findByRole('heading', { name: 'Caixa vazia' })).toBeVisible();

    await router.navigate('/vagas?modelo=remote');
    expect(await screen.findByRole('heading', { name: 'Nada com esses filtros' })).toBeVisible();
  });

  it('sem preferências avisa que não há nota', async () => {
    mockApi({
      ...layoutRoutes(),
      'GET /preferences': () => ({ configured: false }),
      'GET /jobs': () => ({ items: [job({ score: null, scoreReasons: [] })], nextCursor: null }),
    });
    renderApp('/vagas');
    expect(await screen.findByText(/Sem preferências, as vagas não têm nota/)).toBeVisible();
    expect(screen.getByText(/pela ordem em que entraram no app/)).toBeVisible();
  });
});
