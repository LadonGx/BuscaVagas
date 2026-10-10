import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  afterCursor,
  afterScoreCursor,
  decodeCursor,
  decodeScoreCursor,
  encodeCursor,
  encodeScoreCursor,
  toPage,
} from './cursor';

describe('cursor', () => {
  it('ida e volta', () => {
    const key = { t: new Date('2026-10-09T12:00:00.000Z'), id: 'abc' };
    expect(decodeCursor(encodeCursor(key))).toEqual(key);
  });

  it('cursor adulterado vira 400', () => {
    expect(() => decodeCursor('não-é-cursor')).toThrow(BadRequestException);
    expect(() => decodeCursor(Buffer.from('{"t":"x","id":1}').toString('base64url'))).toThrow(
      BadRequestException,
    );
  });

  it('monta a condição "depois do cursor" com desempate por id', () => {
    const t = new Date('2026-10-09T12:00:00.000Z');
    expect(afterCursor('firstSeenAt', { t, id: 'm' })).toEqual({
      OR: [{ firstSeenAt: { lt: t } }, { firstSeenAt: t, id: { lt: 'm' } }],
    });
  });

  it('toPage corta a linha extra e gera o próximo cursor', () => {
    const rows = [
      { id: 'c', at: new Date('2026-10-03') },
      { id: 'b', at: new Date('2026-10-02') },
      { id: 'a', at: new Date('2026-10-01') },
    ];
    const page = toPage(
      rows,
      2,
      (r) => r.at,
      (r) => r.id,
    );

    expect(page.items).toEqual(['c', 'b']);
    expect(decodeCursor(page.nextCursor!)).toEqual({ t: rows[1]!.at, id: 'b' });
    expect(
      toPage(
        rows,
        3,
        (r) => r.at,
        (r) => r.id,
      ).nextCursor,
    ).toBeNull();
  });
});

describe('cursor por nota', () => {
  it('ida e volta, inclusive com nota nula', () => {
    expect(decodeScoreCursor(encodeScoreCursor({ s: 850, id: 'x' }))).toEqual({ s: 850, id: 'x' });
    expect(decodeScoreCursor(encodeScoreCursor({ s: null, id: 'y' }))).toEqual({
      s: null,
      id: 'y',
    });
  });

  it('cursor de uma ordenação não serve na outra', () => {
    const byDate = encodeCursor({ t: new Date('2026-10-01T00:00:00Z'), id: 'a' });
    const byScore = encodeScoreCursor({ s: 500, id: 'a' });
    expect(() => decodeScoreCursor(byDate)).toThrow(BadRequestException);
    expect(() => decodeCursor(byScore)).toThrow(BadRequestException);
  });

  it('depois do cursor: menores, empate pelo id, e as sem nota no fim', () => {
    expect(afterScoreCursor({ s: 700, id: 'm' })).toEqual({
      OR: [{ score: { lt: 700 } }, { score: 700, id: { lt: 'm' } }, { score: null }],
    });
    expect(afterScoreCursor({ s: null, id: 'm' })).toEqual({
      OR: [{ score: null, id: { lt: 'm' } }],
    });
  });
});
