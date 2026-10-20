import type { SalaryPeriod, SalaryRange } from '@busca-vagas/shared';

/** Data da API (ISO ou milissegundos) → ISO 8601; inválida ou ausente → `null`. */
export function toIsoDate(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Fuso das datas sem hora (prazo de inscrição das vagas brasileiras). */
export const DEADLINE_TIME_ZONE = 'America/Sao_Paulo';

/**
 * Só a data: "2026-10-18", ou a mesma data à meia-noite UTC/sem fuso
 * ("2026-10-18T00:00:00.000Z"), que é como campo de data vira texto.
 */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00(?::00(?:\.0+)?)?(?:Z|[+-]00:?00)?)?$/;

/** Minutos de diferença do fuso para o UTC naquele instante (São Paulo: -180). */
function zoneOffsetMinutes(at: Date, timeZone: string): number {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(at)
      .find((part) => part.type === 'timeZoneName')?.value;
    const found = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name ?? '');
    if (!found) return 0;
    const minutes = Number(found[2]) * 60 + Number(found[3] ?? 0);
    return found[1] === '-' ? -minutes : minutes;
  } catch {
    return -180;
  }
}

/**
 * Prazo (fim das inscrições) → ISO 8601. Data sem hora vale até o FIM daquele
 * dia em São Paulo: "2026-10-18" → "2026-10-19T02:59:59.999Z". Com hora,
 * vale como veio.
 */
export function toIsoDeadline(value: string | number | null | undefined): string | null {
  const found = typeof value === 'string' ? DATE_ONLY.exec(value.trim()) : null;
  if (!found) return toIsoDate(value);
  const [year, month, day] = [Number(found[1]), Number(found[2]), Number(found[3])];
  const endUtc = Date.UTC(year, month - 1, day, 23, 59, 59, 999);
  const check = new Date(endUtc);
  // "2026-02-30", "2026-13-01": inválida.
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  const offset = zoneOffsetMinutes(new Date(endUtc), DEADLINE_TIME_ZONE);
  return new Date(endUtc - offset * 60_000).toISOString();
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
