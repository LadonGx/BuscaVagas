import { describe, expect, it } from 'vitest';
import { parseEach } from './parse-each';

describe('parseEach', () => {
  it('mantém os válidos e conta os descartados, inclusive quando o conversor lança', () => {
    const result = parseEach([1, 'x', 3, null], (item) => {
      if (item === null) throw new Error('boom');
      return typeof item === 'number' ? item * 2 : null;
    });

    expect(result).toEqual({ ok: [2, 6], dropped: 2 });
  });
});
