import { describe, expect, it, vi } from 'vitest';
import { AppClient } from './app-client.js';

describe('conversa com o app', () => {
  it('Content-Type: application/json em todo POST/PUT; GET sem ele', async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 'a1', sections: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const app = new AppClient('http://127.0.0.1:8080', fetchFn as unknown as typeof fetch);
    await app.resume();
    await app.createApplication('j1', 'Gupy');
    await app.attachResumeFile('a1', 'Curriculo.pdf', Buffer.from('%PDF'));

    const calls = fetchFn.mock.calls as unknown as [string, RequestInit][];
    const headers = calls.map(([, init]) => init.headers as Record<string, string>);
    expect(calls.map(([, init]) => init.method)).toEqual(['GET', 'POST', 'PUT']);
    expect(headers[0]).not.toHaveProperty('Content-Type');
    expect(headers[1]).toMatchObject({ 'Content-Type': 'application/json' });
    expect(headers[2]).toMatchObject({ 'Content-Type': 'application/json' });
  });
});
