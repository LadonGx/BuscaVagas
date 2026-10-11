import { vi } from 'vitest';

type Handler = (url: URL, init: RequestInit) => unknown;

/**
 * `fetch` falso por rota: `{ 'GET /jobs/counts': () => ({...}) }`. O valor
 * devolvido vira JSON 200; `reply(status, body)` muda o status; rota sem
 * handler responde 404 (e aparece no teste que esqueceu dela).
 */
export function mockApi(routes: Record<string, Handler>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const key = `${init.method ?? 'GET'} ${url.pathname.replace(/^\/api/, '')}`;
    const handler = routes[key];

    if (!handler) {
      return new Response(JSON.stringify({ message: `Sem mock para ${key}` }), { status: 404 });
    }

    const result = await handler(url, init);
    if (result instanceof Response) return result;
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
