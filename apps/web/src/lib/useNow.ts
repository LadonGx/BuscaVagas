import { useEffect, useState } from 'react';

/** Hora atual que se atualiza sozinha — para contagens como "em 3 h 58 min". */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
