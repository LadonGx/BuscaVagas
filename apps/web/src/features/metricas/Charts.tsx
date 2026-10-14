import type { MetricsDto, StackMetricDto } from '@busca-vagas/shared';
import { Check } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { formatNumber } from '../../lib/format';
import { niceMax } from '../inicio/Charts';
import styles from './Metricas.module.css';

/** "2026-10-05" → "05/10". */
export const weekLabel = (week: string) => `${week.slice(8, 10)}/${week.slice(5, 7)}`;

const candidaturas = (count: number) =>
  `${formatNumber(count)} ${count === 1 ? 'candidatura' : 'candidaturas'}`;

/* ------------------------------------------------- candidaturas por semana */

/**
 * Colunas empilhadas: embaixo as que tiveram resposta (série 2), em cima as
 * que ainda não (série 1); a altura total é o que você enviou. Legenda em
 * cima, número só no pico, o resto no toque/teclado; tabela para leitor de tela.
 */
export function WeeklyChart({ weeks }: { weeks: MetricsDto['weekly'] }) {
  const [active, setActive] = useState<number | null>(null);
  const totals = weeks.map((week) => week.sent);
  const max = Math.max(0, ...totals);
  const total = totals.reduce((sum, value) => sum + value, 0);
  const answered = weeks.reduce((sum, week) => sum + week.responded, 0);
  const peak = totals.indexOf(max);
  const { top, step } = niceMax(max);
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step).reverse();
  const last = weeks.length - 1;

  if (weeks.length === 0 || total === 0) {
    return <p className={styles.muted}>Nenhuma candidatura no período.</p>;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setActive((current) => {
      const from = current ?? (event.key === 'ArrowLeft' ? weeks.length : -1);
      return Math.min(last, Math.max(0, from + (event.key === 'ArrowLeft' ? -1 : 1)));
    });
  }

  const describe = (index: number) => {
    const week = weeks[index]!;
    return `Semana de ${weekLabel(week.week)}: ${candidaturas(week.sent)}, ${formatNumber(week.responded)} com resposta`;
  };

  return (
    <div className={styles.chartWrap}>
      <ul className={styles.legend} aria-label="Legenda">
        <li>
          <span className={styles.swatch} data-series="2" aria-hidden="true" />
          Com resposta
        </li>
        <li>
          <span className={styles.swatch} data-series="1" aria-hidden="true" />
          Sem resposta (ainda)
        </li>
      </ul>
      <div
        className={styles.chart}
        tabIndex={0}
        role="img"
        aria-label={`Candidaturas por semana: ${candidaturas(total)}, ${formatNumber(answered)} com resposta; pico de ${formatNumber(max)} na semana de ${weekLabel(weeks[peak]!.week)}. Use as setas para ver cada semana.`}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
      >
        <div className={styles.yAxis} aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick}>{formatNumber(tick)}</span>
          ))}
        </div>
        <div className={styles.plot}>
          <div className={styles.grid} aria-hidden="true">
            {ticks.map((tick) => (
              <span key={tick} />
            ))}
          </div>
          <div className={styles.columns} aria-hidden="true">
            {weeks.map((week, index) => {
              const height = (week.sent / top) * 100;
              const isActive = active === index;
              return (
                <div
                  key={week.week}
                  className={styles.slot}
                  data-active={isActive || undefined}
                  onPointerEnter={() => setActive(index)}
                >
                  {index === peak && !isActive && (
                    <span className={styles.peakLabel} style={{ bottom: `${height}%` }}>
                      {formatNumber(week.sent)}
                    </span>
                  )}
                  {isActive && (
                    <span
                      className={styles.tooltip}
                      style={{ bottom: `${height}%` }}
                      data-edge={index < 2 ? 'start' : index > last - 2 ? 'end' : undefined}
                    >
                      <strong>{candidaturas(week.sent)}</strong>
                      <span>
                        {formatNumber(week.responded)} com resposta · semana de{' '}
                        {weekLabel(week.week)}
                      </span>
                    </span>
                  )}
                  {week.sent > 0 && (
                    <span className={styles.stack} style={{ height: `${height}%` }}>
                      {week.sent > week.responded && (
                        <span
                          className={styles.segment}
                          data-series="1"
                          style={{ flexGrow: week.sent - week.responded }}
                        />
                      )}
                      {week.responded > 0 && (
                        <span
                          className={styles.segment}
                          data-series="2"
                          style={{ flexGrow: week.responded }}
                        />
                      )}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className={styles.xAxis} aria-hidden="true">
        <span>{weekLabel(weeks[0]!.week)}</span>
        <span>esta semana</span>
      </div>
      <p className="sr-only" aria-live="polite">
        {active !== null && describe(active)}
      </p>
      <div className="sr-only">
        <table>
          <caption>Candidaturas por semana</caption>
          <thead>
            <tr>
              <th scope="col">Semana de</th>
              <th scope="col">Enviadas</th>
              <th scope="col">Com resposta</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week.week}>
                <td>{weekLabel(week.week)}</td>
                <td>{week.sent}</td>
                <td>{week.responded}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- lista de barras */

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** Texto do valor ("12 vagas · 34%"). */
  text: string;
  /** Selo depois do nome ("no currículo"), com ícone: nunca só cor. */
  badge?: string;
}

/**
 * Barras horizontais de uma série (ranking): nome e valor escritos em cada
 * linha, então não precisa de dica. A barra é proporcional ao maior valor.
 */
export function BarList({ rows, label }: { rows: BarRow[]; label: string }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <ol className={styles.bars} aria-label={label}>
      {rows.map((row) => (
        <li key={row.key} className={styles.barRow}>
          <div className={styles.barText}>
            <span className={styles.barName}>
              {row.label}
              {row.badge && (
                <span className={styles.badge}>
                  <Check size={12} aria-hidden="true" />
                  {row.badge}
                </span>
              )}
            </span>
            <span className={styles.barValue}>{row.text}</span>
          </div>
          <div className={styles.barTrack} aria-hidden="true">
            {row.value > 0 && (
              <span className={styles.bar} style={{ width: `${(row.value / max) * 100}%` }} />
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** "docker" → linha da lista: "12 vagas · 34%". */
export function stackRow(stack: StackMetricDto, withBadge = true): BarRow {
  return {
    key: stack.name,
    label: stack.name,
    value: stack.jobs,
    text: `${formatNumber(stack.jobs)} ${stack.jobs === 1 ? 'vaga' : 'vagas'} · ${Math.round(stack.share * 100)}%`,
    badge: withBadge && stack.inResume ? 'no currículo' : undefined,
  };
}
