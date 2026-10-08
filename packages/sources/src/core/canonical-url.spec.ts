import { describe, expect, it } from 'vitest';
import { canonicalUrl } from './canonical-url';

describe('canonicalUrl', () => {
  it('remove rastreamento, fragmento e barra final', () => {
    expect(canonicalUrl('https://Jobs.Example.com/vaga/1/?utm_source=x&fbclid=y#apply')).toBe(
      'https://jobs.example.com/vaga/1',
    );
  });

  it('mantém parâmetros que identificam a vaga', () => {
    expect(canonicalUrl('https://boards.example.com/acme?gh_jid=123&utm_medium=email')).toBe(
      'https://boards.example.com/acme?gh_jid=123',
    );
  });

  it('ordena a query para que a ordem não gere duplicata', () => {
    expect(canonicalUrl('https://x.com/a?b=2&a=1')).toBe(canonicalUrl('https://x.com/a?a=1&b=2'));
  });

  it('recusa o que não é http(s)', () => {
    expect(canonicalUrl('javascript:alert(1)')).toBeNull();
    expect(canonicalUrl('não é url')).toBeNull();
  });
});
