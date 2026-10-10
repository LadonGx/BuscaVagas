import { describe, expect, it } from 'vitest';
import { buildSalary, toIsoDate } from './values';
import { contractFromText, workModelFromText } from './work-model';

describe('modalidade pelo texto', () => {
  it.each([
    ['Remote - Brazil', 'remote'],
    ['São Paulo (Híbrido)', 'hybrid'],
    ['Hybrid / Remote', 'hybrid'],
    ['On-site', 'onsite'],
    ['Presencial - Recife', 'onsite'],
    ['São Paulo', null],
    [null, null],
  ] as const)('%s → %s', (text, expected) => {
    expect(workModelFromText(text)).toBe(expected);
  });
});

describe('contrato pelo texto', () => {
  it.each([
    ['Intern', 'internship'],
    ['Estágio', 'internship'],
    ['Temporary', 'temporary'],
    ['CLT', 'clt'],
    ['PJ', 'pj'],
    ['Contractor', 'other'],
    ['Contract', 'other'],
    ['Full-time', null],
    ['FullTime', null],
    ['Part-time', null],
    [null, null],
  ] as const)('%s → %s', (text, expected) => {
    expect(contractFromText(text)).toBe(expected);
  });
});

describe('valores', () => {
  it('data ISO ou milissegundos', () => {
    expect(toIsoDate('2026-10-01T12:00:00Z')).toBe('2026-10-01T12:00:00.000Z');
    expect(toIsoDate(1_790_000_000_000)).toBe(new Date(1_790_000_000_000).toISOString());
    expect(toIsoDate('ontem')).toBeNull();
    expect(toIsoDate(null)).toBeNull();
  });

  it('salário só com moeda, período e algum valor', () => {
    expect(buildSalary({ min: 8000.4, max: 12000, currency: 'brl', period: 'month' })).toEqual({
      min: 8000,
      max: 12000,
      currency: 'BRL',
      period: 'month',
    });
    expect(buildSalary({ min: 1, max: 2, currency: 'reais', period: 'month' })).toBeNull();
    expect(buildSalary({ min: null, max: null, currency: 'USD', period: 'year' })).toBeNull();
    expect(buildSalary({ min: 1, max: 2, currency: 'USD', period: null })).toBeNull();
    expect(buildSalary({ min: -5, max: 100, currency: 'USD', period: 'hour' })).toEqual({
      min: null,
      max: 100,
      currency: 'USD',
      period: 'hour',
    });
  });
});
