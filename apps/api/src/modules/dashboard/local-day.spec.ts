import { describe, expect, it } from 'vitest';
import { lastLocalDays, localDateKey, startOfLocalDay } from './local-day';

const SP = 'America/Sao_Paulo';

describe('datas no fuso local', () => {
  it('23h de São Paulo ainda é o mesmo dia, mesmo já sendo o dia seguinte em UTC', () => {
    const date = new Date('2026-10-11T02:30:00.000Z'); // 10/10, 23h30 em SP
    expect(localDateKey(date, SP)).toBe('2026-10-10');
    expect(localDateKey(date, 'UTC')).toBe('2026-10-11');
  });

  it('meia-noite local', () => {
    const date = new Date('2026-10-11T02:30:00.000Z');
    expect(startOfLocalDay(date, SP).toISOString()).toBe('2026-10-10T03:00:00.000Z');
    expect(startOfLocalDay(date, 'UTC').toISOString()).toBe('2026-10-11T00:00:00.000Z');
  });

  it('últimos dias, do mais antigo até hoje, virando o mês', () => {
    expect(lastLocalDays(new Date('2026-10-02T15:00:00.000Z'), SP, 4)).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
  });

  it('horário de verão não pula nem repete dia', () => {
    // Nova York adianta o relógio em 08/03/2026.
    const days = lastLocalDays(new Date('2026-03-10T12:00:00.000Z'), 'America/New_York', 4);
    expect(days).toEqual(['2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10']);
  });
});
