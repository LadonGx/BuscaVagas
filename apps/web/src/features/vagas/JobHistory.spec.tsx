import type { JobDto, JobHistoryDto, JobOccurrenceDto } from '@busca-vagas/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { jobFlags } from '../../components/job/JobFlags';
import { mockApi } from '../../test/api-mock';
import { inactiveBoard, job, layoutRoutes, source } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { occurrenceStatus, occurrenceWhen } from './JobHistory';

const name = (id: string) => ({ gupy: 'Gupy', greenhouse: 'Greenhouse' })[id] ?? id;

const repost = job({
  id: 'j2',
  title: 'Full Stack Júnior',
  company: 'Acme',
  repost: {
    count: 2,
    previousSeenAt: '2026-09-20T12:00:00.000Z',
    previous: {
      id: 'j1',
      triage: 'dismissed',
      triagedAt: '2026-09-21T12:00:00.000Z',
      application: null,
    },
  },
  alsoOn: [{ source: 'greenhouse', url: 'https://job-boards.greenhouse.io/acme/jobs/9' }],
});

const occurrence = (overrides: Partial<JobOccurrenceDto> = {}): JobOccurrenceDto => ({
  jobId: 'j1',
  source: 'gupy',
  url: 'https://acme.gupy.io/jobs/1',
  firstSeenAt: '2026-09-02T12:00:00.000Z',
  lastSeenAt: '2026-09-20T12:00:00.000Z',
  triage: 'dismissed',
  triagedAt: '2026-09-21T12:00:00.000Z',
  application: null,
  ...overrides,
});

function setup(current: JobDto, history: JobHistoryDto) {
  let state = { ...history };
  const calls: unknown[] = [];
  mockApi({
    ...layoutRoutes(),
    'GET /discovery/sources': () => [
      source(),
      { ...inactiveBoard(), active: true, trackedCompanies: 1 },
    ],
    'GET /jobs': () => ({ items: [current], nextCursor: null }),
    'GET /jobs/:id': () => current,
    'GET /jobs/:id/history': () => state,
    'PUT /jobs/:id/reposts': (_url, init) => {
      const body = JSON.parse(String(init.body)) as { muted: boolean };
      calls.push(body);
      state = { ...state, repostsMuted: body.muted };
      return state;
    },
  });
  return { calls };
}

describe('Repostadas', () => {
  it('cartão mostra os selos; o painel mostra outros links e as vezes anteriores', async () => {
    setup(repost, {
      repostsMuted: false,
      occurrences: [
        occurrence(),
        occurrence({
          jobId: null,
          url: 'https://acme.gupy.io/jobs/0',
          firstSeenAt: null,
          lastSeenAt: '2026-07-01T12:00:00.000Z',
          triage: 'forgotten',
          triagedAt: null,
        }),
      ],
    });
    const user = userEvent.setup();
    renderApp('/vagas');

    const card = await screen.findByRole('article', { name: 'Full Stack Júnior' });
    const flags = within(card).getByRole('list', { name: 'Avisos da vaga' });
    expect(flags).toHaveTextContent('Repostada 2× · você descartou');
    await waitFor(() => expect(flags).toHaveTextContent('Também na Greenhouse'));

    await user.click(within(card).getByRole('button', { name: 'Full Stack Júnior' }));
    const drawer = await screen.findByRole('dialog', { name: /Full Stack Júnior/ });
    const section = within(drawer).getByRole('region', { name: 'Outros links e repostagens' });
    expect(within(section).getByRole('link', { name: /Também na Greenhouse/ })).toHaveAttribute(
      'href',
      'https://job-boards.greenhouse.io/acme/jobs/9',
    );

    const before = await within(section).findByRole('list', { name: 'Já apareceu antes' });
    const items = within(before).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Vista de 02/09/2026 a 20/09/2026 · via Gupy');
    expect(items[0]).toHaveTextContent('Descartada em 21/09/2026');
    expect(within(items[0]!).getByRole('link', { name: 'Abrir essa vaga' })).toHaveAttribute(
      'href',
      '/vagas?vaga=j1',
    );
    expect(items[1]).toHaveTextContent('Descartada; apagada pela limpeza em 01/07/2026');

    // Na caixa: sem a chave de "descartar sempre".
    expect(within(section).queryByRole('switch')).not.toBeInTheDocument();
  });

  it('candidatura na vaga anterior: aviso no selo e no painel', async () => {
    const applied = job({
      ...repost,
      repost: {
        count: 1,
        previousSeenAt: null,
        previous: {
          id: 'j1',
          triage: 'inbox',
          triagedAt: null,
          application: { id: 'a1', status: 'applied' },
        },
      },
      alsoOn: [],
    });
    setup(applied, {
      repostsMuted: false,
      occurrences: [
        occurrence({
          triage: 'inbox',
          triagedAt: null,
          application: { id: 'a1', status: 'applied', appliedAt: '2026-09-05T12:00:00.000Z' },
        }),
      ],
    });
    renderApp('/vagas?vaga=j2');

    const drawer = await screen.findByRole('dialog', { name: /Full Stack Júnior/ });
    expect(
      await within(drawer).findByText(/Você já se candidatou a esta vaga em 05\/09\/2026/),
    ).toBeInTheDocument();
    expect(within(drawer).getByText('Repostada · você já se candidatou')).toBeInTheDocument();
  });

  it('descartada: a chave "descartar sozinha se for repostada" liga e desliga', async () => {
    const dismissed = job({ id: 'j3', title: 'Back-end Júnior', triage: 'dismissed' });
    const { calls } = setup(dismissed, { repostsMuted: false, occurrences: [] });
    const user = userEvent.setup();
    renderApp('/vagas?aba=descartadas&vaga=j3');

    const drawer = await screen.findByRole('dialog', { name: /Back-end Júnior/ });
    const section = within(drawer).getByRole('region', { name: 'Se for repostada' });
    const toggle = await within(section).findByRole('switch', {
      name: /Descartar sozinha se for repostada/,
    });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).not.toBeChecked();

    await user.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(calls).toEqual([{ muted: true }]);
    expect(
      await screen.findByText('Se esta vaga for repostada, ela já entra descartada.'),
    ).toBeInTheDocument();
  });
});

describe('peças das repostadas', () => {
  it('selos', () => {
    expect(jobFlags(job(), name)).toEqual([]);
    expect(jobFlags(repost, name).map((flag) => [flag.text, flag.tone])).toEqual([
      ['Repostada 2× · você descartou', 'info'],
      ['Também na Greenhouse', 'info'],
    ]);
    expect(
      jobFlags(
        {
          repost: { count: 1, previousSeenAt: null, previous: null },
          alsoOn: [
            { source: 'greenhouse', url: 'a' },
            { source: 'lever', url: 'b' },
          ],
        },
        name,
      ).map((flag) => flag.text),
    ).toEqual(['Repostada', 'Em mais 2 fontes']);
  });

  it('linhas do histórico', () => {
    expect(occurrenceWhen(occurrence({ firstSeenAt: '2026-09-20T12:00:00.000Z' }))).toBe(
      'Vista em 20/09/2026',
    );
    expect(occurrenceStatus(occurrence({ triage: 'saved' }))).toBe('Salva em 21/09/2026');
    expect(occurrenceStatus(occurrence({ triage: 'inbox', triagedAt: null }))).toBe(
      'Ficou na caixa, sem triar',
    );
  });
});
