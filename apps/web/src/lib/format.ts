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
