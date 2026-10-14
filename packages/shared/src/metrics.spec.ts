import { describe, expect, it } from 'vitest';
import {
  median,
  metricsQuerySchema,
  rate,
  responseBucket,
  weeksBetween,
  weekStart,
} from './metrics';

describe('métricas', () => {
  it('semana começa na segunda', () => {
    expect(weekStart('2026-10-14')).toBe('2026-10-12'); // quarta
    expect(weekStart('2026-10-12')).toBe('2026-10-12'); // segunda
    expect(weekStart('2026-10-11')).toBe('2026-10-05'); // domingo
    expect(weeksBetween('2026-09-30', '2026-10-14')).toEqual([
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
    ]);
    // Virada de ano.
    expect(weekStart('2027-01-01')).toBe('2026-12-28');
  });

  it('mediana, faixas e taxa', () => {
    expect(median([])).toBeNull();
    expect(median([10, 2, 4])).toBe(4);
    expect(median([1, 2])).toBe(1.5);
    expect(median([1.04, 1.06])).toBe(1.1);
    expect([0, 3, 4, 7, 8, 14, 15, 30, 31, 400].map(responseBucket)).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3, 4, 4,
    ]);
    expect(rate(1, 3)).toBe(33);
    expect(rate(0, 0)).toBeNull();
  });

  it('período: 30, 90 ou tudo (0); padrão 90', () => {
    expect(metricsQuerySchema.parse({})).toEqual({ days: 90 });
    expect(metricsQuerySchema.parse({ days: '0' })).toEqual({ days: 0 });
    expect(metricsQuerySchema.safeParse({ days: '7' }).success).toBe(false);
  });
});
