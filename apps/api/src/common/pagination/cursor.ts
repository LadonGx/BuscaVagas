import { BadRequestException } from '@nestjs/common';

/**
 * Cursor opaco para paginação por chave: `{ t: data, id }` em base64url.
 *
 * A listagem ordena por (data desc, id desc). A próxima página começa
 * estritamente depois do último item visto — então descartar vagas entre uma
 * página e outra não faz nenhuma ser pulada, como faria um `offset`.
 */
export interface CursorKey {
  t: Date;
  id: string;
}

export function encodeCursor(key: CursorKey): string {
  return Buffer.from(JSON.stringify({ t: key.t.toISOString(), id: key.id })).toString('base64url');
}

export function decodeCursor(cursor: string): CursorKey {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      t?: unknown;
      id?: unknown;
    };
    const t = typeof parsed.t === 'string' ? new Date(parsed.t) : null;

    if (!t || Number.isNaN(t.getTime()) || typeof parsed.id !== 'string' || !parsed.id) {
      throw new Error('formato');
    }

    return { t, id: parsed.id };
  } catch {
    throw new BadRequestException({ statusCode: 400, message: 'Cursor inválido.' });
  }
}

/**
 * Condição Prisma "depois do cursor" para ordenação (campo desc, id desc).
 * Quem chama faz o cast para o `WhereInput` do modelo.
 */
export function afterCursor(field: string, key: CursorKey): { OR: Record<string, unknown>[] } {
  return {
    OR: [{ [field]: { lt: key.t } }, { [field]: key.t, id: { lt: key.id } }],
  };
}

/**
 * Recebe `limit + 1` linhas: se veio a extra, há próxima página.
 */
export function toPage<Row extends { id: string }, Item>(
  rows: Row[],
  limit: number,
  cursorDate: (row: Row) => Date,
  map: (row: Row) => Item,
): { items: Item[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);

  return {
    items: page.map(map),
    nextCursor: hasMore && last ? encodeCursor({ t: cursorDate(last), id: last.id }) : null,
  };
}

/* ------------------------------------------------------- cursor por nota */

/**
 * Cursor da ordenação por nota: `{ s: nota | null, id }`. A ordem é
 * (nota desc, nulas no fim, id desc). Cursor de uma ordenação usado na outra
 * é 400 — o formato é diferente de propósito.
 */
export interface ScoreCursorKey {
  s: number | null;
  id: string;
}

export function encodeScoreCursor(key: ScoreCursorKey): string {
  return Buffer.from(JSON.stringify({ s: key.s, id: key.id })).toString('base64url');
}

export function decodeScoreCursor(cursor: string): ScoreCursorKey {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      s?: unknown;
      id?: unknown;
    };
    const validScore =
      parsed.s === null || (typeof parsed.s === 'number' && Number.isInteger(parsed.s));
    if (!('s' in parsed) || !validScore || typeof parsed.id !== 'string' || !parsed.id) {
      throw new Error('formato');
    }
    return { s: parsed.s as number | null, id: parsed.id };
  } catch {
    throw new BadRequestException({ statusCode: 400, message: 'Cursor inválido.' });
  }
}

/** "Depois do cursor" para (score desc nulls last, id desc). */
export function afterScoreCursor(key: ScoreCursorKey): { OR: Record<string, unknown>[] } {
  if (key.s === null) {
    return { OR: [{ score: null, id: { lt: key.id } }] };
  }
  return {
    OR: [{ score: { lt: key.s } }, { score: key.s, id: { lt: key.id } }, { score: null }],
  };
}
