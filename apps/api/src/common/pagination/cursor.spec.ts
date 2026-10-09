import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { afterCursor, decodeCursor, encodeCursor, toPage } from './cursor';

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
