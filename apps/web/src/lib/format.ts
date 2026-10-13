/**
 * Textos de data e número em PT-BR, sempre a partir de um `now` explícito
 * para dar para testar sem relógio de verdade.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const numberFormat = new Intl.NumberFormat('pt-BR');
const shortDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

const PERIOD_SUFFIX: Record<string, string> = { hour: '/h', month: '/mês', year: '/ano' };

function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    // Moeda que o Intl não conhece: número com o código na frente.
    return `${currency} ${numberFormat.format(value)}`;
  }
}

/** "R$ 4.000 – R$ 6.000/mês", "até R$ 5.000/mês", "a partir de US$ 3.000/ano". */
export function formatSalary(job: {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
}): string | null {
  const { salaryMin: min, salaryMax: max } = job;
  if (min === null && max === null) return null;

  const currency = job.salaryCurrency ?? 'BRL';
  const suffix = job.salaryPeriod ? (PERIOD_SUFFIX[job.salaryPeriod] ?? '') : '';

  if (min !== null && max !== null && min !== max) {
    return `${money(min, currency)} – ${money(max, currency)}${suffix}`;
  }
  if (min !== null && max !== null) return `${money(min, currency)}${suffix}`;
  if (max !== null) return `até ${money(max, currency)}${suffix}`;
  return `a partir de ${money(min as number, currency)}${suffix}`;
}

/** Duração curta: "menos de 1 min", "45 min", "3 h 58 min", "2 dias". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, ms);
  if (total < MINUTE) return 'menos de 1 min';
  if (total < HOUR) return `${Math.floor(total / MINUTE)} min`;
  if (total < DAY) {
    const hours = Math.floor(total / HOUR);
    const minutes = Math.floor((total % HOUR) / MINUTE);
    return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  }
  const days = Math.floor(total / DAY);
  return days === 1 ? '1 dia' : `${days} dias`;
}

/** Passado: "agora", "há 5 min", "há 2 h", "há 3 dias"; mais de 30 dias vira "12/09". */
export function formatAgo(date: Date | string, now: Date = new Date()): string {
  const then = typeof date === 'string' ? new Date(date) : date;
  const diff = now.getTime() - then.getTime();

  if (diff < MINUTE) return 'agora';
  if (diff < HOUR) return `há ${Math.floor(diff / MINUTE)} min`;
  if (diff < DAY) return `há ${Math.floor(diff / HOUR)} h`;
  if (diff < 30 * DAY) {
    const days = Math.floor(diff / DAY);
    return days === 1 ? 'há 1 dia' : `há ${days} dias`;
  }
  return shortDate.format(then);
}

/** Futuro: "em 3 h 58 min". Hora que já passou vira "a qualquer momento". */
export function formatUntil(date: Date | string, now: Date = new Date()): string {
  const then = typeof date === 'string' ? new Date(date) : date;
  const diff = then.getTime() - now.getTime();
  return diff <= 0 ? 'a qualquer momento' : `em ${formatDuration(diff)}`;
}

const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** "qui., 15/10, 14:00" — próximas etapas e eventos. */
export function formatDateTime(date: Date | string): string {
  return dateTimeFormat.format(typeof date === 'string' ? new Date(date) : date);
}

/** "15/10/2026". */
export function formatDate(date: Date | string): string {
  return dateFormat.format(typeof date === 'string' ? new Date(date) : date);
}

const dayFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Dia sem hora (prazo de inscrição: "2026-12-08T00:00Z" é 08/12, não 07/12 à noite). */
export function formatDay(date: Date | string): string {
  return dayFormat.format(typeof date === 'string' ? new Date(date) : date);
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Data → valor de `<input type="datetime-local">` no fuso do navegador. */
export function toLocalInput(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valor do `datetime-local` (hora local) → ISO com fuso, como a API espera. */
export function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}
