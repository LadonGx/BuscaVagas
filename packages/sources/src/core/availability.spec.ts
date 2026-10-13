import { describe, expect, it } from 'vitest';
import { checkAvailability, isRestrictedHost } from './availability';
import { HttpError, type HttpClient } from './http';

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
