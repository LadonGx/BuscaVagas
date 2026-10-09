import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { dateInputSchema, optionalText, pageQuerySchema, queryList } from './common';

describe('queryList', () => {
  const schema = z.object({ tags: queryList(z.enum(['a', 'b', 'c'])) });

  it('aceita repetição e vírgula', () => {
    expect(schema.parse({ tags: ['a', 'b,c'] }).tags).toEqual(['a', 'b', 'c']);
  });

  it('vazio vira undefined', () => {
    expect(schema.parse({ tags: '' }).tags).toBeUndefined();
    expect(schema.parse({}).tags).toBeUndefined();
  });

  it('recusa valor fora do enum', () => {
    expect(schema.safeParse({ tags: 'x' }).success).toBe(false);
  });
});

describe('optionalText', () => {
  const schema = z.object({ note: optionalText(10) });

  it('apara e trata vazio como null', () => {
    expect(schema.parse({ note: '  oi  ' }).note).toBe('oi');
    expect(schema.parse({ note: '   ' }).note).toBeNull();
    expect(schema.parse({}).note).toBeUndefined();
  });

  it('respeita o tamanho máximo', () => {
    expect(schema.safeParse({ note: 'x'.repeat(11) }).success).toBe(false);
  });
});

describe('pageQuerySchema', () => {
  it('aplica o limite padrão e converte string', () => {
    expect(pageQuerySchema.parse({}).limit).toBe(30);
    expect(pageQuerySchema.parse({ limit: '5' }).limit).toBe(5);
  });

  it('recusa limite fora da faixa', () => {
    expect(pageQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });
});

describe('dateInputSchema', () => {
  it('aceita data com fuso e só o dia', () => {
    expect(dateInputSchema.parse('2026-10-09T14:00:00-03:00').toISOString()).toBe(
      '2026-10-09T17:00:00.000Z',
    );
    expect(dateInputSchema.parse('2026-10-09').toISOString()).toBe('2026-10-09T00:00:00.000Z');
  });

  it('recusa formato solto', () => {
    expect(dateInputSchema.safeParse('09/10/2026').success).toBe(false);
  });
});
