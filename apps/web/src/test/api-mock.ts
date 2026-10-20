import { vi } from 'vitest';

type Handler = (url: URL, init: RequestInit, params: Record<string, string>) => unknown;

/** "PUT /jobs/:id/triage" casa com "PUT /jobs/abc/triage" → { id: 'abc' }. */
function match(pattern: string, key: string): Record<string, string> | null {
  const names: string[] = [];
  const regex = new RegExp(
    '^' +
      pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:(\w+)/g, (_, name: string) => {
        names.push(name);
        return '([^/]+)';
      }) +
      '$',
  );
  const found = regex.exec(key);
  if (!found) return null;
  return Object.fromEntries(
    names.map((name, index) => [name, decodeURIComponent(found[index + 1] ?? '')]),
  );
}

/**
 * `fetch` falso por rota: `{ 'GET /jobs/counts': () => ({...}) }`; aceita
 * parâmetros (`'PUT /jobs/:id/triage'`). O valor
 * devolvido vira JSON 200; `reply(status, body)` muda o status; rota sem
 * handler responde 404 (e aparece no teste que esqueceu dela). Escrita sem
 * `Content-Type: application/json` (ou `application/zip`) responde 415, como a API.
 */
export function mockApi(routes: Record<string, Handler>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init.method ?? 'GET';
    const key = `${method} ${url.pathname.replace(/^\/api/, '')}`;

    // Como a API (local-only.ts): escrita só com JSON ou o .zip do backup, com ou sem corpo.
    const type = new Headers(init.headers).get('Content-Type') ?? '';
    if (method !== 'GET' && !/^application\/(json|zip)\b/i.test(type)) {
      return new Response(
        JSON.stringify({ message: `${key} sem Content-Type: application/json` }),
        {
          status: 415,
        },
      );
    }
    let handler = routes[key];
    let params: Record<string, string> = {};
    if (!handler) {
      for (const [pattern, candidate] of Object.entries(routes)) {
        const found = pattern.includes(':') ? match(pattern, key) : null;
        if (found) {
          handler = candidate;
          params = found;
          break;
        }
      }
    }

    if (!handler) {
      return new Response(JSON.stringify({ message: `Sem mock para ${key}` }), { status: 404 });
    }

    const result = await handler(url, init, params);
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
