import { describe, expect, it } from 'vitest';
import { formatAgo, formatDuration, formatNumber, formatUntil } from './format';

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
