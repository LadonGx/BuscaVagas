import type { ResumeDto, ResumeItemData, ResumeSectionKind } from '@busca-vagas/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi } from '../../test/api-mock';
import { layoutRoutes, resume } from '../../test/fixtures';
import { renderApp } from '../../test/render';

type Call = { method: string; path: string; body?: unknown };

/** API do currículo com estado, como a de verdade. */
function setup(initial: ResumeDto = resume()) {
  const data = structuredClone(initial);
  const calls: Call[] = [];
  let seq = 0;
  const body = (init: RequestInit) => (init.body ? JSON.parse(String(init.body)) : undefined);
  const log = (method: string, path: string, init?: RequestInit) =>
    calls.push({ method, path, ...(init?.body ? { body: body(init) } : {}) });
  const sectionOf = (id: string) => data.sections.find((section) => section.id === id)!;
  const itemOf = (id: string) =>
    data.sections.flatMap((section) => section.items).find((item) => item.id === id)!;
  const noContent = () => new Response(null, { status: 204 });

  mockApi({
    ...layoutRoutes(),
    'GET /resume': () => data,
    'PATCH /resume/items/:id': (_u, init, { id }) => {
      log('PATCH', `/resume/items/${id}`, init);
      const item = itemOf(id!);
      item.data = body(init).data as ResumeItemData;
      return item;
    },
    'DELETE /resume/items/:id': (_u, _i, { id }) => {
      log('DELETE', `/resume/items/${id}`);
      for (const section of data.sections) {
        section.items = section.items.filter((item) => item.id !== id);
      }
      return noContent();
    },
    'POST /resume/sections/:id/items': (_u, init, { id }) => {
      log('POST', `/resume/sections/${id}/items`, init);
      const section = sectionOf(id!);
      seq += 1;
      const item = { id: `novo-${seq}`, position: section.items.length, data: body(init).data };
      section.items.push(item);
      return item;
    },
    'PUT /resume/sections/:id/items/order': (_u, init, { id }) => {
      log('PUT', `/resume/sections/${id}/items/order`, init);
      const section = sectionOf(id!);
      const ids = body(init).ids as string[];
      section.items = ids.map((itemId, position) => ({ ...itemOf(itemId), position }));
      return section;
    },
    'POST /resume/sections': (_u, init) => {
      log('POST', '/resume/sections', init);
      const input = body(init) as { title: string; kind: ResumeSectionKind };
      seq += 1;
      const section = { id: `secao-${seq}`, position: data.sections.length, items: [], ...input };
      data.sections.push(section);
      return section;
    },
    'PATCH /resume/sections/:id': (_u, init, { id }) => {
      log('PATCH', `/resume/sections/${id}`, init);
      const section = sectionOf(id!);
      section.title = body(init).title;
      return section;
    },
    'DELETE /resume/sections/:id': (_u, _i, { id }) => {
      log('DELETE', `/resume/sections/${id}`);
      data.sections = data.sections.filter((section) => section.id !== id);
      return noContent();
    },
    'PUT /resume/sections/order': (_u, init) => {
      log('PUT', '/resume/sections/order', init);
      const ids = body(init).ids as string[];
      data.sections = ids.map((sectionId, position) => ({ ...sectionOf(sectionId), position }));
      return data;
    },
  });

  return { calls, data };
}

async function openPage() {
  const user = userEvent.setup();
  const app = renderApp('/curriculo');
  await screen.findByRole('heading', { name: 'Contato' });
  return { user, ...app };
}

const saveButton = () => screen.getByRole('button', { name: /^Salvar$|^Salvando/ });

describe('Currículo', () => {
  it('mostra uma seção por cartão, cada uma do seu jeito, e tudo com nome', async () => {
    setup();
    await openPage();

    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Dados pessoais',
      'Contato',
      'Resumo profissional',
      'Experiência',
      'Competências',
      'Respostas prontas',
    ]);
    expect(screen.getByRole('textbox', { name: /^E-mail/ })).toHaveValue('ana@email.com');
    expect(screen.getByRole('textbox', { name: 'Resumo profissional' })).toHaveValue(
      'Dev full stack júnior.',
    );
    expect(screen.getByRole('article', { name: 'Desenvolvedora Jr' })).toHaveTextContent(
      'Lumen · Remoto · 01/2025 – atual',
    );
    expect(screen.getByText('22 caracteres')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Escolher arquivo' })).toBeDisabled();
    expect(screen.getByText('Chega na Fase 3')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();

    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAccessibleName();
    }
  });

  it('"Copiar" num campo copia só o valor; vazio não copia', async () => {
    setup();
    const { user } = await openPage();

    await user.click(screen.getByRole('button', { name: 'Copiar E-mail' }));
    expect(await navigator.clipboard.readText()).toBe('ana@email.com');
    expect(screen.getByRole('button', { name: 'E-mail copiado' })).toHaveTextContent('Copiado');

    expect(screen.getByRole('button', { name: 'Copiar Telefone/WhatsApp' })).toBeDisabled();
  });

  it('copiar entrada, seção ou tudo usa o mesmo texto do export', async () => {
    setup();
    const { user } = await openPage();

    await user.click(screen.getByRole('button', { name: 'Copiar Desenvolvedora Jr' }));
    expect(await navigator.clipboard.readText()).toBe(
      'Desenvolvedora Jr — Lumen (Remoto)\n01/2025 – atual\nAPIs em NestJS.',
    );

    await user.click(screen.getByRole('button', { name: 'Copiar seção Contato' }));
    expect(await navigator.clipboard.readText()).toBe('E-mail: ana@email.com');

    await user.click(screen.getByRole('button', { name: 'Copiar currículo inteiro' }));
    const all = await navigator.clipboard.readText();
    expect(all).toMatch(/^DADOS PESSOAIS\nNome completo: Ana Souza/);
    expect(all).toContain('EXPERIÊNCIA\nDesenvolvedora Jr — Lumen (Remoto)');
  });

  it('o que foi digitado copia antes de salvar', async () => {
    setup();
    const { user } = await openPage();

    const email = screen.getByRole('textbox', { name: /^E-mail/ });
    await user.clear(email);
    await user.type(email, 'ana@novo.com ');
    await user.click(screen.getByRole('button', { name: 'Copiar E-mail' }));
    expect(await navigator.clipboard.readText()).toBe('ana@novo.com');
  });

  it('"Salvar" envia só os itens alterados, um de cada vez', async () => {
    const { calls } = setup();
    const { user } = await openPage();

    const email = screen.getByRole('textbox', { name: /^E-mail/ });
    await user.clear(email);
    await user.type(email, 'ana@novo.com');
    await user.type(
      screen.getByRole('textbox', { name: 'Resumo profissional' }),
      ' Gosto de testes.',
    );

    expect(screen.getByText('2 alterações não salvas · Ctrl+S salva')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'E-mail (não salvo)' })).toBeInTheDocument();
    expect(calls).toEqual([]);

    await user.click(saveButton());
    expect(await screen.findByText('Currículo salvo.')).toBeInTheDocument();
    expect(calls).toEqual([
      {
        method: 'PATCH',
        path: '/resume/items/i-email',
        body: { data: { label: 'E-mail', value: 'ana@novo.com' } },
      },
      {
        method: 'PATCH',
        path: '/resume/items/i-resumo',
        body: { data: { text: 'Dev full stack júnior. Gosto de testes.' } },
      },
    ]);
    expect(saveButton()).toBeDisabled();
    expect(screen.queryByText(/não salvas?/)).not.toBeInTheDocument();
  });

  it('voltar ao valor salvo não conta como alteração', async () => {
    setup();
    const { user } = await openPage();

    const email = screen.getByRole('textbox', { name: /^E-mail/ });
    await user.type(email, 'x');
    expect(saveButton()).toBeEnabled();
    await user.type(email, '{Backspace}');
    expect(saveButton()).toBeDisabled();
  });

  it('item inválido não é enviado: o erro aparece no campo e o resto salva', async () => {
    const { calls } = setup();
    const { user } = await openPage();

    await user.click(screen.getByRole('button', { name: 'Editar Desenvolvedora Jr' }));
    await user.click(screen.getByRole('checkbox', { name: 'Ainda estou aqui (sem data de fim)' }));
    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '2024-06' } });
    await user.click(screen.getByRole('button', { name: 'Concluir' }));
    await user.type(screen.getByRole('textbox', { name: /^E-mail/ }), 'r');

    await user.click(saveButton());
    expect(
      await screen.findByText(/1 item tem erro — corrija os campos marcados\. O outro foi salvo\./),
    ).toBeInTheDocument();
    expect(calls.map((call) => call.path)).toEqual(['/resume/items/i-email']);
    // A entrada abriu sozinha para mostrar o erro.
    expect(screen.getByText('A data de fim é anterior à de início')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '2025-06' } });
    expect(screen.queryByText('A data de fim é anterior à de início')).not.toBeInTheDocument();
    // Continua aberta enquanto a pessoa mexe.
    expect(screen.getByLabelText('Fim')).toHaveValue('2025-06');

    await user.click(saveButton());
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toEqual({
      method: 'PATCH',
      path: '/resume/items/i-exp',
      body: {
        data: {
          title: 'Desenvolvedora Jr',
          organization: 'Lumen',
          location: 'Remoto',
          startDate: '2025-01',
          endDate: '2025-06',
          current: false,
          description: 'APIs em NestJS.',
        },
      },
    });
  });

  it('Ctrl+S salva, mesmo com o cursor dentro do campo', async () => {
    const { calls } = setup();
    const { user } = await openPage();

    await user.type(screen.getByRole('textbox', { name: /^Linguagens/ }), ', Go');
    await user.keyboard('{Control>}s{/Control}');

    await screen.findByText('Currículo salvo.');
    expect(calls).toEqual([
      {
        method: 'PATCH',
        path: '/resume/items/i-ling',
        body: { data: { label: 'Linguagens', value: 'TypeScript, Java, Go' } },
      },
    ]);
  });

  it('sair com algo não salvo pergunta antes', async () => {
    setup();
    const { user, router } = await openPage();

    await user.type(screen.getByRole('textbox', { name: /^E-mail/ }), 'r');
    await user.click(screen.getByRole('link', { name: /Preferências/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Sair sem salvar?' });
    expect(dialog).toHaveTextContent('1 alteração ainda não foi salva e vai se perder.');
    await user.click(within(dialog).getByRole('button', { name: 'Continuar editando' }));
    expect(router.state.location.pathname).toBe('/curriculo');
    expect(screen.getByRole('textbox', { name: /^E-mail/ })).toHaveValue('ana@email.comr');

    await user.click(screen.getByRole('link', { name: /Preferências/ }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Sair sem salvar' }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/preferencias'));
  });

  it('"Salvar e sair" salva antes de trocar de tela', async () => {
    const { calls } = setup();
    const { user, router } = await openPage();

    await user.type(screen.getByRole('textbox', { name: /^E-mail/ }), 'r');
    await user.click(screen.getByRole('link', { name: /Preferências/ }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Salvar e sair' }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe('/preferencias'));
    expect(calls).toHaveLength(1);
  });

  it('"Ver e salvar PDF" salva o rascunho e abre a folha', async () => {
    const { calls } = setup();
    const { user, router } = await openPage();

    await user.type(screen.getByRole('textbox', { name: /^E-mail/ }), 'r');
    await user.click(screen.getByRole('button', { name: 'Ver e salvar PDF' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/curriculo/imprimir'));
    expect(calls).toHaveLength(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('"Organizar" renomeia, move e apaga direto na API', async () => {
    const { calls } = setup();
    const { user } = await openPage();

    await user.click(screen.getByRole('button', { name: 'Organizar Contato' }));
    const name = screen.getByRole('textbox', { name: 'Nome da seção' });
    await user.clear(name);
    await user.type(name, 'Contatos');
    await user.click(screen.getByRole('button', { name: 'Renomear' }));
    expect(await screen.findByRole('heading', { name: 'Contatos' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Descer E-mail' }));
    await user.click(screen.getByRole('button', { name: 'Apagar Telefone/WhatsApp' }));
    await user.click(
      screen.getByRole('button', { name: 'Clique de novo para apagar Telefone/WhatsApp' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: /Telefone/ })).not.toBeInTheDocument(),
    );

    expect(calls).toEqual([
      { method: 'PATCH', path: '/resume/sections/s-contato', body: { title: 'Contatos' } },
      {
        method: 'PUT',
        path: '/resume/sections/s-contato/items/order',
        body: { ids: ['i-tel', 'i-email'] },
      },
      { method: 'DELETE', path: '/resume/items/i-tel' },
    ]);
  });

  it('o rótulo do campo é conteúdo: muda no rascunho e vai no "Salvar"', async () => {
    const { calls } = setup();
    const { user } = await openPage();

    await user.click(screen.getByRole('button', { name: 'Organizar Contato' }));
    const label = screen.getByRole('textbox', { name: 'Rótulo de E-mail' });
    await user.clear(label);
    await user.type(label, 'E-mail pessoal');
    expect(calls).toEqual([]);

    await user.click(saveButton());
    await waitFor(() =>
      expect(calls).toEqual([
        {
          method: 'PATCH',
          path: '/resume/items/i-email',
          body: { data: { label: 'E-mail pessoal', value: 'ana@email.com' } },
        },
      ]),
    );
  });

  it('adiciona entrada (com validação), campo e seção', async () => {
    const { calls } = setup();
    const { user } = await openPage();

    await user.click(screen.getByRole('button', { name: 'Adicionar experiência' }));
    const form = screen.getByRole('form', { name: 'Adicionar experiência' });
    await user.click(within(form).getByRole('button', { name: 'Adicionar' }));
    expect(within(form).getByText('Preencha este campo.')).toBeInTheDocument();
    expect(calls).toEqual([]);

    await user.type(within(form).getByLabelText(/Título/), 'Estágio');
    await user.type(within(form).getByLabelText('Organização'), 'Fluxo');
    await user.click(within(form).getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByRole('article', { name: 'Estágio' })).toBeInTheDocument();

    const contato = screen.getByRole('region', { name: 'Contato' });
    await user.click(within(contato).getByRole('button', { name: 'Adicionar campo' }));
    await user.type(
      within(contato).getByRole('textbox', { name: 'Nome do novo campo em Contato' }),
      'Skype{Enter}',
    );
    expect(await within(contato).findByRole('textbox', { name: 'Skype' })).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Adicionar seção' }));
    const newSection = screen.getByRole('form', { name: 'Nova seção' });
    await user.type(within(newSection).getByLabelText(/Nome/), 'Voluntariado');
    await user.click(within(newSection).getByRole('radio', { name: /Entradas/ }));
    await user.click(within(newSection).getByRole('button', { name: 'Criar seção' }));
    expect(await screen.findByRole('heading', { name: 'Voluntariado' })).toBeInTheDocument();

    expect(calls).toEqual([
      {
        method: 'POST',
        path: '/resume/sections/s-exp/items',
        body: {
          data: {
            title: 'Estágio',
            organization: 'Fluxo',
            location: null,
            startDate: null,
            endDate: null,
            current: false,
            description: null,
          },
        },
      },
      {
        method: 'POST',
        path: '/resume/sections/s-contato/items',
        body: { data: { label: 'Skype', value: '' } },
      },
      {
        method: 'POST',
        path: '/resume/sections',
        body: { title: 'Voluntariado', kind: 'entries' },
      },
    ]);
  });

  it('o rascunho continua quando a estrutura muda', async () => {
    setup();
    const { user } = await openPage();

    await user.type(screen.getByRole('textbox', { name: /^E-mail/ }), 'r');
    const contato = screen.getByRole('region', { name: 'Contato' });
    await user.click(within(contato).getByRole('button', { name: 'Adicionar campo' }));
    await user.type(
      within(contato).getByRole('textbox', { name: 'Nome do novo campo em Contato' }),
      'Skype{Enter}',
    );
    await within(contato).findByRole('textbox', { name: 'Skype' });

    expect(screen.getByRole('textbox', { name: /^E-mail/ })).toHaveValue('ana@email.comr');
    expect(saveButton()).toBeEnabled();
  });

  it('apagar a seção pede o segundo clique', async () => {
    const { calls } = setup();
    const { user } = await openPage();

    await user.click(screen.getByRole('button', { name: 'Organizar Competências' }));
    await user.click(screen.getByRole('button', { name: 'Apagar seção Competências' }));
    expect(calls).toEqual([]);
    await user.click(
      screen.getByRole('button', { name: 'Clique de novo para apagar seção Competências' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Competências' })).not.toBeInTheDocument(),
    );
    expect(calls).toEqual([{ method: 'DELETE', path: '/resume/sections/s-comp' }]);
  });
});
