import { isAnswered, type InterviewQuestionDto, type PracticeRating } from '@busca-vagas/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi } from '../../test/api-mock';
import { application, layoutRoutes, question } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { suggestQuestions } from '../candidaturas/ApplicationQuestions';
import { filterQuestions } from './filters';

const bank = (): InterviewQuestionDto[] => [
  question({ id: 'q-1', question: 'Fale um pouco sobre você.', category: 'hr' }),
  question({
    id: 'q-2',
    question: 'Fale de um conflito no time.',
    category: 'behavioral',
    tags: ['conflito', 'time'],
    starSituation: 'Dois devs discordavam do formato da API.',
    answered: true,
    practice: { count: 1, lastRating: 'again', practicedAt: '2026-10-10T12:00:00.000Z' },
  }),
  question({
    id: 'q-3',
    question: 'O que é uma API REST?',
    category: 'technical',
    tags: ['api', 'http'],
    answer: 'Recursos com URL e métodos HTTP.',
    answered: true,
    asked: [
      {
        applicationId: 'app-1',
        jobTitle: 'Back-end Jr (NestJS)',
        company: 'Lumen Saúde',
        askedAt: '2026-10-08T12:00:00.000Z',
        note: 'Pediram exemplo de status 201',
      },
    ],
  }),
];

type Call = { method: string; path: string; body?: unknown };

/** API das perguntas com estado, como a de verdade. */
function setup(initial = bank()) {
  let list = structuredClone(initial);
  const calls: Call[] = [];
  let seq = 10;
  const body = (init: RequestInit) => (init.body ? JSON.parse(String(init.body)) : undefined);
  const save = (updated: InterviewQuestionDto) => {
    const answered = isAnswered(updated);
    const next = { ...updated, answered };
    list = list.some((item) => item.id === next.id)
      ? list.map((item) => (item.id === next.id ? next : item))
      : [...list, next];
    return next;
  };
  const find = (id: string) => list.find((item) => item.id === id)!;

  mockApi({
    ...layoutRoutes(),
    'GET /interview-questions': () => list,
    'POST /interview-questions': (_u, init) => {
      const input = body(init) as Partial<InterviewQuestionDto> & { askedIn?: string };
      calls.push({ method: 'POST', path: '/interview-questions', body: input });
      seq += 1;
      const { askedIn, ...rest } = input;
      return save(
        question({
          ...rest,
          id: `q-${seq}`,
          seeded: false,
          asked: askedIn
            ? [
                {
                  applicationId: askedIn,
                  jobTitle: 'Back-end Jr (NestJS)',
                  company: 'Lumen Saúde',
                  askedAt: new Date().toISOString(),
                  note: null,
                },
              ]
            : [],
        }),
      );
    },
    'PATCH /interview-questions/:id': (_u, init, { id }) => {
      const input = body(init) as Partial<InterviewQuestionDto>;
      calls.push({ method: 'PATCH', path: `/interview-questions/${id}`, body: input });
      const clean = Object.fromEntries(
        Object.entries(input).map(([key, value]) => [key, value === '' ? null : value]),
      );
      return save({ ...find(id!), ...clean });
    },
    'DELETE /interview-questions/:id': (_u, _i, { id }) => {
      calls.push({ method: 'DELETE', path: `/interview-questions/${id}` });
      list = list.filter((item) => item.id !== id);
      return new Response(null, { status: 204 });
    },
    'POST /interview-questions/:id/practice': (_u, init, { id }) => {
      const { rating } = body(init) as { rating: PracticeRating };
      calls.push({ method: 'POST', path: `/interview-questions/${id}/practice`, body: { rating } });
      const current = find(id!);
      return save({
        ...current,
        practice: {
          count: current.practice.count + 1,
          lastRating: rating,
          practicedAt: new Date().toISOString(),
        },
      });
    },
    'PUT /interview-questions/:id/asked/:applicationId': (_u, init, { id, applicationId }) => {
      const input = body(init) as { note?: string };
      calls.push({
        method: 'PUT',
        path: `/interview-questions/${id}/asked/${applicationId}`,
        body: input,
      });
      const current = find(id!);
      const others = current.asked.filter((item) => item.applicationId !== applicationId);
      const previous = current.asked.find((item) => item.applicationId === applicationId);
      return save({
        ...current,
        asked: [
          {
            applicationId: applicationId!,
            jobTitle: 'Back-end Jr (NestJS)',
            company: 'Lumen Saúde',
            askedAt: previous?.askedAt ?? new Date().toISOString(),
            note: input.note === undefined ? (previous?.note ?? null) : input.note || null,
          },
          ...others,
        ],
      });
    },
    'DELETE /interview-questions/:id/asked/:applicationId': (_u, _i, { id, applicationId }) => {
      calls.push({ method: 'DELETE', path: `/interview-questions/${id}/asked/${applicationId}` });
      const current = find(id!);
      return save({
        ...current,
        asked: current.asked.filter((item) => item.applicationId !== applicationId),
      });
    },
    'GET /applications': () => ({ items: [application()], nextCursor: null }),
    'GET /applications/:id': () => application(),
    'GET /resume': () => ({ sections: [] }),
  });
  return { calls };
}

const listItems = () =>
  within(screen.getByRole('list', { name: 'Perguntas' }))
    .getAllByRole('listitem')
    .map((item) => within(item).getAllByRole('button')[0]!.querySelector('span')!.textContent);

describe('Entrevistas', () => {
  it('lista, conta e filtra por categoria, situação, tag e busca', async () => {
    setup();
    const user = userEvent.setup();
    const { router } = renderApp('/entrevistas');

    expect(
      await screen.findByText('3 perguntas · 2 respondidas · 1 para treinar'),
    ).toBeInTheDocument();
    expect(listItems()).toEqual([
      'Fale um pouco sobre você.',
      'Fale de um conflito no time.',
      'O que é uma API REST?',
    ]);
    const rest = screen.getByText('O que é uma API REST?').closest('li')!;
    expect(rest).toHaveTextContent('Caiu em 1 processo');

    await user.click(screen.getByRole('button', { name: /Comportamental\s*1/ }));
    expect(router.state.location.search).toBe('?categoria=comportamental');
    expect(listItems()).toEqual(['Fale de um conflito no time.']);
    expect(screen.getByText('Fale de um conflito no time.').closest('li')).toHaveTextContent(
      'Para treinar',
    );

    await user.click(screen.getByRole('button', { name: /^Todas/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Situação' }), 'unanswered');
    expect(listItems()).toEqual(['Fale um pouco sobre você.']);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Situação' }), '');

    await user.click(screen.getByRole('button', { name: '#api' }));
    expect(listItems()).toEqual(['O que é uma API REST?']);
    await user.click(screen.getByRole('button', { name: 'Tirar o filtro da tag api' }));

    await user.type(screen.getByRole('searchbox'), 'formato da api');
    await waitFor(() => expect(listItems()).toEqual(['Fale de um conflito no time.']));
  });

  it('editar: STAR aberto na comportamental, salva só o que mudou de verdade', async () => {
    const { calls } = setup();
    const user = userEvent.setup();
    renderApp('/entrevistas?pergunta=q-2');

    const drawer = await screen.findByRole('dialog', { name: 'Editar pergunta' });
    expect(within(drawer).getByLabelText(/Situação/)).toHaveValue(
      'Dois devs discordavam do formato da API.',
    );
    expect(within(drawer).getByRole('button', { name: 'Salvar' })).toBeDisabled();

    await user.type(within(drawer).getByLabelText(/Resultado/), 'Entregamos no prazo.');
    await user.click(within(drawer).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls[0]).toMatchObject({
      method: 'PATCH',
      path: '/interview-questions/q-2',
      body: {
        starResult: 'Entregamos no prazo.',
        tags: ['conflito', 'time'],
        category: 'behavioral',
      },
    });
  });

  it('fechar com alteração não salva pergunta antes', async () => {
    const { calls } = setup();
    const user = userEvent.setup();
    renderApp('/entrevistas?pergunta=q-1');

    const drawer = await screen.findByRole('dialog', { name: 'Editar pergunta' });
    await user.type(within(drawer).getByLabelText('Sua resposta'), 'Sou dev full stack.');
    await user.click(within(drawer).getByRole('button', { name: 'Cancelar' }));
    expect(within(drawer).getByText('Descartar as alterações?')).toBeInTheDocument();
    await user.click(within(drawer).getByRole('button', { name: 'Continuar editando' }));
    expect(within(drawer).getByLabelText('Sua resposta')).toHaveValue('Sou dev full stack.');

    await user.keyboard('{Escape}');
    await user.click(within(drawer).getByRole('button', { name: 'Descartar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls).toEqual([]);
  });

  it('nova pergunta: cria e abre para continuar; apagar pede confirmação', async () => {
    const { calls } = setup();
    const user = userEvent.setup();
    const { router } = renderApp('/entrevistas');

    await user.click(await screen.findByRole('button', { name: 'Nova pergunta' }));
    const drawer = await screen.findByRole('dialog', { name: 'Nova pergunta' });
    await user.click(within(drawer).getByRole('button', { name: 'Criar pergunta' }));
    // Sem texto: o botão nem habilita.
    expect(calls).toEqual([]);

    await user.type(within(drawer).getByLabelText(/Pergunta/), 'Como você usa Git no dia a dia?');
    await user.selectOptions(within(drawer).getByLabelText('Categoria'), 'technical');
    await user.type(within(drawer).getByLabelText('Tags'), 'Git, git , fluxo');
    await user.click(within(drawer).getByRole('button', { name: 'Criar pergunta' }));

    await waitFor(() => expect(router.state.location.search).toBe('?pergunta=q-11'));
    expect(calls[0]).toMatchObject({
      method: 'POST',
      body: {
        question: 'Como você usa Git no dia a dia?',
        category: 'technical',
        tags: ['git', 'fluxo'],
      },
    });

    const edit = await screen.findByRole('dialog', { name: 'Editar pergunta' });
    await user.click(within(edit).getByRole('button', { name: 'Apagar…' }));
    await user.click(within(edit).getByRole('button', { name: 'Apagar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.at(-1)).toEqual({ method: 'DELETE', path: '/interview-questions/q-11' });
  });
});

describe('Treino', () => {
  it('mostra a resposta, avalia e passa para a próxima; teclas funcionam', async () => {
    const { calls } = setup();
    const user = userEvent.setup();
    renderApp('/entrevistas/treino?categoria=tecnica');

    const card = await screen.findByRole('article', { name: 'Pergunta do treino' });
    expect(card).toHaveTextContent('O que é uma API REST?');
    expect(screen.getByText('1 pergunta no treino')).toBeInTheDocument();

    await user.keyboard(' ');
    expect(within(card).getByRole('region', { name: 'Sua resposta' })).toHaveTextContent(
      'Recursos com URL e métodos HTTP.',
    );
    await user.keyboard('1');
    await waitFor(() =>
      expect(calls).toEqual([
        {
          method: 'POST',
          path: '/interview-questions/q-3/practice',
          body: { rating: 'again' },
        },
      ]),
    );
    expect(
      await screen.findByText('Nesta sessão: 1 · 0 fui bem · 1 para treinar'),
    ).toBeInTheDocument();
  });

  it('pergunta sem resposta: convida a escrever', async () => {
    setup();
    const user = userEvent.setup();
    renderApp('/entrevistas/treino?categoria=rh');

    await user.click(await screen.findByRole('button', { name: 'Mostrar minha resposta' }));
    expect(screen.getByRole('link', { name: 'Escrever agora' })).toHaveAttribute(
      'href',
      '/entrevistas?pergunta=q-1',
    );
  });

  it('"só as que preciso treinar" sem nenhuma: aviso', async () => {
    setup(bank().map((item) => ({ ...item, practice: { ...item.practice, lastRating: null } })));
    const user = userEvent.setup();
    renderApp('/entrevistas/treino');

    await screen.findByRole('article', { name: 'Pergunta do treino' });
    await user.click(screen.getByRole('checkbox', { name: 'Só as que preciso treinar' }));
    expect(await screen.findByText('Nada para treinar aqui')).toBeInTheDocument();
  });
});

describe('Perguntas no painel da candidatura', () => {
  it('lista as que caíram, anota, tira, marca uma do banco e cria uma nova', async () => {
    const { calls } = setup();
    const user = userEvent.setup();
    renderApp('/candidaturas/app-1');

    const drawer = await screen.findByRole('dialog', { name: /Back-end Jr/ });
    const section = within(drawer).getByRole('region', { name: 'Perguntas da entrevista' });
    expect(
      await within(section).findByRole('link', { name: 'O que é uma API REST?' }),
    ).toHaveAttribute('href', '/entrevistas?pergunta=q-3');
    expect(section).toHaveTextContent('Pediram exemplo de status 201');

    await user.click(within(section).getByRole('button', { name: 'Editar anotação' }));
    const note = within(section).getByRole('textbox', { name: 'Como foi' });
    await user.clear(note);
    await user.type(note, 'Fui bem');
    await user.click(within(section).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(section).toHaveTextContent('Fui bem'));
    expect(calls[0]).toEqual({
      method: 'PUT',
      path: '/interview-questions/q-3/asked/app-1',
      body: { note: 'Fui bem' },
    });

    const input = within(section).getByLabelText('Qual pergunta fizeram?');
    await user.type(input, 'conflito');
    await user.click(within(section).getByRole('button', { name: 'Fale de um conflito no time.' }));
    await waitFor(() =>
      expect(
        within(section).getByRole('link', { name: 'Fale de um conflito no time.' }),
      ).toBeInTheDocument(),
    );

    await user.type(input, 'Explique o event loop');
    await user.selectOptions(
      within(section).getByRole('combobox', { name: 'Categoria da pergunta nova' }),
      'technical',
    );
    await user.click(within(section).getByRole('button', { name: 'Adicionar como pergunta nova' }));
    await waitFor(() =>
      expect(
        within(section).getByRole('link', { name: 'Explique o event loop' }),
      ).toBeInTheDocument(),
    );
    expect(calls.find((call) => call.method === 'POST')).toMatchObject({
      body: { question: 'Explique o event loop', category: 'technical', askedIn: 'app-1' },
    });

    fireEvent.click(
      within(section).getByRole('button', {
        name: 'Tirar "O que é uma API REST?" desta candidatura',
      }),
    );
    await waitFor(() =>
      expect(
        within(section).queryByRole('link', { name: 'O que é uma API REST?' }),
      ).not.toBeInTheDocument(),
    );
  });
});

describe('peças', () => {
  it('filtro e sugestões ignoram acento e maiúsculas', () => {
    expect(filterQuestions(bank(), { q: 'VOCE' }).map((item) => item.id)).toEqual(['q-1']);
    expect(filterQuestions(bank(), { status: 'practice' }).map((item) => item.id)).toEqual(['q-2']);
    expect(suggestQuestions(bank(), 'fale', new Set(['q-1'])).map((item) => item.id)).toEqual([
      'q-2',
    ]);
    expect(suggestQuestions(bank(), '   ', new Set())).toEqual([]);
  });
});
