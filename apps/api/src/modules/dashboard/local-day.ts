/**
 * Datas no fuso da máquina. O app é local: o fuso do processo da API é o da
 * pessoa, então "hoje" e "por dia" seguem ele.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Fuso do processo (ex.: `America/Sao_Paulo`). */
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function parts(date: Date, timeZone: string): Record<string, number> {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  return Object.fromEntries(
    formatted
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
}

/** `AAAA-MM-DD` da data no fuso. */
export function localDateKey(date: Date, timeZone: string): string {
  const p = parts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Instante da meia-noite local do dia de `date`. */
export function startOfLocalDay(date: Date, timeZone: string): Date {
  const p = parts(date, timeZone);
  const sinceMidnightMs =
    ((p.hour ?? 0) * 3600 + (p.minute ?? 0) * 60 + (p.second ?? 0)) * 1000 +
    date.getUTCMilliseconds();
  return new Date(date.getTime() - sinceMidnightMs);
}

/**
 * Os últimos `days` dias locais, do mais antigo até hoje, como `AAAA-MM-DD`.
 * Conta no calendário (não em blocos de 24 h), então horário de verão não
 * pula nem repete dia.
 */
export function lastLocalDays(now: Date, timeZone: string, days: number): string[] {
  const [year, month, day] = localDateKey(now, timeZone).split('-').map(Number);
  const today = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  return Array.from({ length: days }, (_, i) =>
    new Date(today - (days - 1 - i) * DAY_MS).toISOString().slice(0, 10),
  );
}
