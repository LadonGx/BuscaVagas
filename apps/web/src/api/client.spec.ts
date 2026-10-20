import { describe, expect, it, vi } from 'vitest';
import { api, ApiError, ApiOfflineError, toQueryString } from './client';

function respond(status: number, body?: unknown) {
  return vi.fn(
    async () =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
}

describe('toQueryString', () => {
  it('pula vazios e junta listas com vírgula', () => {
    expect(
      toQueryString({
        q: 'node',
        workModel: ['remote', 'hybrid'],
        stack: [],
        minScore: 0,
        hideIncompatible: true,
        cursor: undefined,
        source: null,
        empty: '',
      }),
    ).toBe('?q=node&workModel=remote%2Chybrid&minScore=0&hideIncompatible=true');
    expect(toQueryString({})).toBe('');
  });
});

describe('apiRequest', () => {
  it('GET com query no caminho /api', async () => {
    const fetch = respond(200, { items: [] });
    vi.stubGlobal('fetch', fetch);

    await expect(api.get('/jobs', { limit: 5 })).resolves.toEqual({ items: [] });
    expect(fetch).toHaveBeenCalledWith('/api/jobs?limit=5', { method: 'GET', signal: undefined });
  });

  it('corpo vai como JSON', async () => {
    const fetch = respond(200, { ok: true });
    vi.stubGlobal('fetch', fetch);

    await api.put('/jobs/1/triage', { status: 'saved' });
    expect(fetch).toHaveBeenCalledWith('/api/jobs/1/triage', {
      method: 'PUT',
      signal: undefined,
      body: '{"status":"saved"}',
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('escrita sem corpo também manda Content-Type: application/json (a API exige)', async () => {
    const fetch = respond(204);
    vi.stubGlobal('fetch', fetch);

    await api.delete('/jobs/1');
    await api.post('/discovery/scan');
    await api.put('/jobs/1/reposts');
    await api.patch('/jobs/1');
    for (const [, init] of fetch.mock.calls as unknown as [string, RequestInit][]) {
      expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(init.body).toBeUndefined();
    }
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('upload vai cru, com o tipo do arquivo', async () => {
    const fetch = respond(200, { ok: true });
    vi.stubGlobal('fetch', fetch);
    const zip = new Blob(['PK'], { type: 'application/zip' });

    await api.upload('/backup/inspect', zip, 'application/zip');
    expect(fetch).toHaveBeenCalledWith('/api/backup/inspect', {
      method: 'POST',
      signal: undefined,
      body: zip,
      headers: { 'Content-Type': 'application/zip' },
    });
  });

  it('204 devolve undefined', async () => {
    vi.stubGlobal('fetch', respond(204));
    await expect(api.delete('/jobs/1')).resolves.toBeUndefined();
  });

  it('erro da API vira ApiError com a mensagem e os detalhes', async () => {
    vi.stubGlobal(
      'fetch',
      respond(400, {
        statusCode: 400,
        message: 'Dados inválidos',
        issues: [{ path: 'title', message: 'Obrigatório' }],
      }),
    );

    const error = await api.post('/jobs', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      message: 'Dados inválidos',
      issues: [{ path: 'title', message: 'Obrigatório' }],
    });
  });

  it('erro sem mensagem usa uma padrão', async () => {
    vi.stubGlobal('fetch', respond(404, {}));
    await expect(api.get('/jobs/x')).rejects.toThrow('Não encontrado.');
  });

  it('corpo de erro que não é JSON usa a mensagem padrão', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<h1>boom</h1>', { status: 500 })),
    );
    await expect(api.get('/jobs')).rejects.toThrow('Erro interno na API.');
  });

  it('sem resposta ou 502 do proxy = API fora do ar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(api.get('/health')).rejects.toBeInstanceOf(ApiOfflineError);

    vi.stubGlobal('fetch', respond(502));
    await expect(api.get('/health')).rejects.toBeInstanceOf(ApiOfflineError);
  });
});
