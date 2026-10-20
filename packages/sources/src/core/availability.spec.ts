import { describe, expect, it } from 'vitest';
import { checkAvailability, isRestrictedHost } from './availability';
import { createHttpClient, HttpError, type HttpClient } from './http';

/** Respostas por URL: objeto = JSON, string = HTML, número = status de erro. */
function fakeHttp(routes: Record<string, unknown>) {
  const calls: string[] = [];
  const answer = (url: string) => {
    calls.push(url);
    const value = routes[url];
    if (value === undefined) throw new HttpError('HTTP 404', url, 404);
    if (typeof value === 'number') throw new HttpError(`HTTP ${value}`, url, value);
    if (value instanceof Error) throw value;
    return value;
  };
  const http: HttpClient = {
    getJson: async (url) => answer(url),
    getText: async (url) => answer(url) as string,
  };
  return { http, calls };
}

const NOW = new Date('2026-10-12T12:00:00Z');

describe('a vaga ainda está aberta?', () => {
  it('Greenhouse e Lever: pela API oficial, pelo id', async () => {
    const { http, calls } = fakeHttp({
      'https://boards-api.greenhouse.io/v1/boards/acme/jobs/123': { id: 123 },
    });
    expect(
      await checkAvailability(
        { source: 'greenhouse', url: null, externalId: '123', board: 'acme' },
        http,
      ),
    ).toEqual({ state: 'open', reason: 'Está no board da empresa no Greenhouse' });
    expect(
      await checkAvailability(
        { source: 'lever', url: null, externalId: 'abc', board: 'acme' },
        http,
      ),
    ).toEqual({ state: 'closed', reason: 'Saiu do board da empresa no Lever' });
    expect(calls[1]).toBe('https://api.lever.co/v0/postings/acme/abc');
  });

  it('sem o slug guardado, tira do link do board', async () => {
    const { calls, http } = fakeHttp({});
    await checkAvailability(
      {
        source: 'greenhouse',
        url: 'https://job-boards.greenhouse.io/vtex/jobs/77',
        externalId: '77',
        board: null,
      },
      http,
    );
    expect(calls).toEqual(['https://boards-api.greenhouse.io/v1/boards/vtex/jobs/77']);
  });

  it('Ashby: confere se o id está no board', async () => {
    const { http } = fakeHttp({
      'https://api.ashbyhq.com/posting-api/job-board/acme': { jobs: [{ id: 'a1' }] },
    });
    const check = (externalId: string) =>
      checkAvailability({ source: 'ashby', url: null, externalId, board: 'acme' }, http);
    expect((await check('a1')).state).toBe('open');
    expect((await check('a2')).state).toBe('closed');
  });

  it('página da vaga (Gupy, manual): 404, texto de encerrada, validThrough vencido', async () => {
    const { http } = fakeHttp({
      'https://acme.gupy.io/job/1': '<h1>Dev</h1><button>Candidatar-se</button>',
      'https://acme.gupy.io/job/2': '<div>Esta vaga foi encerrada. Veja outras.</div>',
      'https://carreiras.acme.com/3':
        '<script type="application/ld+json">{"@type":"JobPosting","validThrough":"2026-10-01T00:00:00Z"}</script>',
      'https://carreiras.acme.com/4': 503,
    });
    const check = (url: string) =>
      checkAvailability({ source: 'gupy', url, externalId: null, board: null }, http, NOW);
    expect(await check('https://acme.gupy.io/job/1')).toEqual({
      state: 'open',
      reason: 'A página da vaga está no ar',
    });
    expect(await check('https://acme.gupy.io/job/2')).toEqual({
      state: 'closed',
      reason: 'A página diz: "vaga foi encerrada"',
    });
    expect(await check('https://acme.gupy.io/job/9')).toMatchObject({ state: 'closed' });
    expect(await check('https://carreiras.acme.com/3')).toEqual({
      state: 'closed',
      reason: 'Inscrições até 01/10/2026',
    });
    expect(await check('https://carreiras.acme.com/4')).toEqual({
      state: 'unknown',
      reason: 'Não deu para conferir agora (HTTP 503)',
    });
  });

  it('texto de "encerrada" dentro de <script> não conta', async () => {
    const { http } = fakeHttp({
      'https://acme.gupy.io/job/5':
        '<script>var t = "vaga encerrada";</script><p>Candidatar-se</p>',
    });
    expect(
      (
        await checkAvailability(
          { source: 'gupy', url: 'https://acme.gupy.io/job/5', externalId: null, board: null },
          http,
        )
      ).state,
    ).toBe('open');
  });

  it('LinkedIn, Indeed, Glassdoor, InfoJobs e Vagas.com: não acessa', async () => {
    const { http, calls } = fakeHttp({});
    const result = await checkAvailability(
      {
        source: 'manual',
        url: 'https://www.linkedin.com/jobs/view/123',
        externalId: null,
        board: null,
      },
      http,
    );
    expect(result).toEqual({
      state: 'unknown',
      reason: 'Este site não permite conferência automática: abra o link para ver',
    });
    expect(calls).toEqual([]);
    expect(isRestrictedHost('https://br.indeed.com/viewjob?jk=1')).toBe(true);
    expect(isRestrictedHost('https://www.glassdoor.com.br/x')).toBe(true);
    expect(isRestrictedHost('https://acme.gupy.io/job/1')).toBe(false);
  });

  it('"não está disponível para PcD" não é vaga fechada; frases inteiras de fechada são', async () => {
    const { http } = fakeHttp({
      'https://acme.gupy.io/job/6': '<p>Esta vaga não está disponível para PcD apenas.</p>',
      'https://acme.gupy.io/job/7': '<p>Vaga indisponível para candidatos fora de SP.</p>',
      'https://acme.gupy.io/job/8': '<p>Esta vaga não está mais disponível.</p>',
      'https://acme.gupy.io/job/9': '<p>Inscrições encerradas</p>',
      'https://jobs.acme.com/1': '<h2>This job is no longer available</h2>',
    });
    const check = (url: string) =>
      checkAvailability({ source: 'gupy', url, externalId: null, board: null }, http, NOW);
    expect((await check('https://acme.gupy.io/job/6')).state).toBe('open');
    expect((await check('https://acme.gupy.io/job/7')).state).toBe('open');
    expect(await check('https://acme.gupy.io/job/8')).toEqual({
      state: 'closed',
      reason: 'A página diz: "Esta vaga não está mais disponível"',
    });
    expect((await check('https://acme.gupy.io/job/9')).state).toBe('closed');
    expect((await check('https://jobs.acme.com/1')).state).toBe('closed');
  });

  it('validThrough só com a data vale até o fim do dia em São Paulo', async () => {
    const { http } = fakeHttp({
      'https://carreiras.acme.com/hoje': '{"@type":"JobPosting","validThrough":"2026-10-12"}',
      'https://carreiras.acme.com/ontem':
        '{"@type":"JobPosting","validThrough":"2026-10-11T00:00:00.000Z"}',
    });
    const check = (url: string) =>
      checkAvailability({ source: 'manual', url, externalId: null, board: null }, http, NOW);
    // 12/10 às 23h em São Paulo (02:00Z do dia 13): ainda aberta.
    const lateNight = new Date('2026-10-13T02:00:00Z');
    expect(
      (
        await checkAvailability(
          {
            source: 'manual',
            url: 'https://carreiras.acme.com/hoje',
            externalId: null,
            board: null,
          },
          http,
          lateNight,
        )
      ).state,
    ).toBe('open');
    expect(await check('https://carreiras.acme.com/ontem')).toEqual({
      state: 'closed',
      reason: 'Inscrições até 11/10/2026',
    });
  });

  it('link que redireciona para LinkedIn & cia.: não segue, nem com uma requisição', async () => {
    const fetched: string[] = [];
    const routes: Record<string, () => Response> = {
      'https://bit.ly/vaga': () =>
        new Response(null, { status: 301, headers: { Location: 'https://lnkd.in/abc' } }),
      'https://carreiras.acme.com/r': () =>
        new Response(null, { status: 302, headers: { Location: '/vaga/1' } }),
      'https://carreiras.acme.com/vaga/1': () =>
        new Response(null, {
          status: 307,
          headers: { Location: 'https://www.linkedin.com./jobs/view/1' },
        }),
      'https://carreiras.acme.com/ok': () =>
        new Response(null, { status: 302, headers: { Location: '/final' } }),
      'https://carreiras.acme.com/final': () => new Response('<p>Vaga encerrada</p>'),
      'https://carreiras.acme.com/loop': () =>
        new Response(null, { status: 302, headers: { Location: '/loop' } }),
    };
    const http = createHttpClient({
      fetchImpl: async (input, init) => {
        const url = String(input);
        fetched.push(url);
        expect(init?.redirect).toBe('manual');
        const route = routes[url];
        return route ? route() : new Response('não achei', { status: 404 });
      },
    });
    const check = (url: string) =>
      checkAvailability({ source: 'manual', url, externalId: null, board: null }, http, NOW);

    const blocked = {
      state: 'unknown',
      reason: 'O link leva a um site que não permite conferência automática: abra o link para ver',
    };
    expect(await check('https://bit.ly/vaga')).toEqual(blocked);
    expect(await check('https://carreiras.acme.com/r')).toEqual(blocked);
    expect(fetched.some((url) => /linkedin|lnkd/.test(url))).toBe(false);

    expect(await check('https://carreiras.acme.com/ok')).toEqual({
      state: 'closed',
      reason: 'A página diz: "Vaga encerrada"',
    });
    expect(await check('https://carreiras.acme.com/loop')).toEqual({
      state: 'unknown',
      reason: 'Não deu para conferir agora (Mais de 5 redirecionamentos)',
    });
  });

  it('vaga sem link e sem board: não há o que conferir', async () => {
    const { http } = fakeHttp({});
    expect(
      (
        await checkAvailability(
          { source: 'manual', url: null, externalId: null, board: null },
          http,
        )
      ).state,
    ).toBe('unknown');
  });
});
