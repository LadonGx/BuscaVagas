import { describe, expect, it } from 'vitest';
import { isLoopbackHost, rejectNonLocal } from './local-only';

describe('isLoopbackHost', () => {
  it.each(['127.0.0.1:3333', 'localhost:5173', 'LOCALHOST', '[::1]:3333'])('aceita %s', (host) => {
    expect(isLoopbackHost(host)).toBe(true);
  });

  it.each([undefined, '', '192.168.0.10:3333', 'evil.com', '127.0.0.1.evil.com'])(
    'recusa %s',
    (host) => {
      expect(isLoopbackHost(host)).toBe(false);
    },
  );
});

describe('rejectNonLocal', () => {
  const local = { host: '127.0.0.1:3333', contentType: undefined };

  it('libera leitura local', () => {
    expect(rejectNonLocal({ ...local, method: 'GET' })).toBeNull();
  });

  it('barra host externo (DNS rebinding)', () => {
    expect(rejectNonLocal({ ...local, host: 'attacker.com', method: 'GET' })?.status).toBe(403);
  });

  it('barra escrita com corpo que não é JSON', () => {
    const result = rejectNonLocal({
      ...local,
      method: 'POST',
      contentType: 'text/plain',
    });
    expect(result?.status).toBe(415);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'barra %s sem corpo e sem Content-Type (<form> vazio de outro site)',
    (method) => {
      expect(rejectNonLocal({ ...local, method })?.status).toBe(415);
    },
  );

  it('libera escrita sem corpo quando vem Content-Type: application/json', () => {
    expect(
      rejectNonLocal({ ...local, method: 'DELETE', contentType: 'application/json' }),
    ).toBeNull();
  });

  it('libera o .zip do backup (também pede preflight); multipart e form continuam barrados', () => {
    const write = (contentType: string) =>
      rejectNonLocal({ ...local, method: 'POST', contentType });
    expect(write('application/zip')).toBeNull();
    expect(write('multipart/form-data; boundary=x')?.status).toBe(415);
    expect(write('application/x-www-form-urlencoded')?.status).toBe(415);
  });

  it('libera escrita JSON', () => {
    const result = rejectNonLocal({
      ...local,
      method: 'PATCH',
      contentType: 'application/json; charset=utf-8',
    });
    expect(result).toBeNull();
  });
});
