import type { SalaryPeriod, SalaryRange } from '@busca-vagas/shared';

/** Data da API (ISO ou milissegundos) → ISO 8601; inválida ou ausente → `null`. */
export function toIsoDate(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Faixa salarial validada: moeda ISO de 3 letras, valores inteiros não
 * negativos e ao menos um dos dois. Qualquer coisa fora disso → `null`.
 */
export function buildSalary(input: {
  min?: number | null;
  max?: number | null;
  currency?: string | null;
  period: SalaryPeriod | null;
}): SalaryRange | null {
  const currency = input.currency?.trim().toUpperCase() ?? '';
  const clean = (value: number | null | undefined) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  const min = clean(input.min);
  const max = clean(input.max);

  if (!input.period || !/^[A-Z]{3}$/.test(currency) || (min === null && max === null)) {
    return null;
  }
  return { min, max, currency, period: input.period };
}
