import { describe, expect, it } from 'vitest';
import {
  formatAgo,
  formatDuration,
  formatNumber,
  formatSalary,
  formatUntil,
  fromLocalInput,
  toLocalInput,
} from './format';

const NOW = new Date('2026-10-11T15:00:00.000Z');
const minus = (ms: number) => new Date(NOW.getTime() - ms);
const plus = (ms: number) => new Date(NOW.getTime() + ms);
const MIN = 60_000;
const H = 60 * MIN;

describe('format', () => {
  it('duração', () => {
    expect(formatDuration(30_000)).toBe('menos de 1 min');
    expect(formatDuration(45 * MIN)).toBe('45 min');
    expect(formatDuration(3 * H + 58 * MIN)).toBe('3 h 58 min');
    expect(formatDuration(2 * H)).toBe('2 h');
    expect(formatDuration(26 * H)).toBe('1 dia');
    expect(formatDuration(-5)).toBe('menos de 1 min');
  });

  it('há quanto tempo', () => {
    expect(formatAgo(minus(20_000), NOW)).toBe('agora');
    expect(formatAgo(minus(5 * MIN), NOW)).toBe('há 5 min');
    expect(formatAgo(minus(2 * H), NOW)).toBe('há 2 h');
    expect(formatAgo(minus(25 * H), NOW)).toBe('há 1 dia');
    expect(formatAgo(minus(72 * H), NOW)).toBe('há 3 dias');
    expect(formatAgo('2026-08-20T15:00:00.000Z', NOW)).toBe('20/08');
  });

  it('daqui a quanto tempo', () => {
    expect(formatUntil(plus(3 * H + 58 * MIN), NOW)).toBe('em 3 h 58 min');
    expect(formatUntil(minus(MIN), NOW)).toBe('a qualquer momento');
  });

  it('número com separador de milhar', () => {
    expect(formatNumber(12345)).toBe('12.345');
  });
});

describe('salário', () => {
  const salary = (
    salaryMin: number | null,
    salaryMax: number | null,
    salaryCurrency: string | null = 'BRL',
    salaryPeriod: string | null = 'month',
  ) => formatSalary({ salaryMin, salaryMax, salaryCurrency, salaryPeriod });

  // O Intl usa espaço especial entre "R$" e o número; normaliza para comparar.
  const plain = (text: string | null) => text?.replace(/\s/g, ' ');

  it('faixa, só máximo, só mínimo, valor único e sem salário', () => {
    expect(plain(salary(4000, 6000))).toBe('R$ 4.000 – R$ 6.000/mês');
    expect(plain(salary(null, 5000))).toBe('até R$ 5.000/mês');
    expect(plain(salary(3000, null, 'USD', 'year'))).toBe('a partir de US$ 3.000/ano');
    expect(plain(salary(4500, 4500))).toBe('R$ 4.500/mês');
    expect(salary(null, null)).toBeNull();
  });

  it('moeda desconhecida não quebra', () => {
    expect(plain(salary(100, null, 'XYZ1', null))).toBe('a partir de XYZ1 100');
  });
});

describe('datetime-local', () => {
  it('ida e volta mantém o instante', () => {
    const iso = '2026-10-15T17:30:00.000Z';
    const local = toLocalInput(iso);
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(fromLocalInput(local)).toBe(iso);
  });
});
