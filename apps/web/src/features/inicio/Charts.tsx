import type { DashboardDto } from '@busca-vagas/shared';
import { useState, type KeyboardEvent } from 'react';
import { formatNumber } from '../../lib/format';
import styles from './Inicio.module.css';

/* ------------------------------------------------- vagas novas por dia */

/** Eixo com passos "redondos" (1, 2, 5 × 10ⁿ), uns 4: 61 → 0, 20, 40, 60, 80. */
export function niceMax(max: number): { top: number; step: number } {
  if (max <= 0) return { top: 1, step: 1 };
  const rough = Math.max(1, max / 4);
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough)!;
  return { top: Math.ceil(max / step) * step, step };
}

const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' });

/** "2026-10-08" → { short: "08/10", long: "qui., 08/10" }. */
export function dayLabel(date: string): { short: string; long: string } {
  const [, month, day] = date.split('-');
  const short = `${day}/${month}`;
  return { short, long: `${weekday.format(new Date(`${date}T12:00:00Z`))}, ${short}` };
}

const vagas = (count: number) =>
  `${formatNumber(count)} ${count === 1 ? 'vaga nova' : 'vagas novas'}`;

/**
 * Colunas de uma série só (sem legenda: o título diz o que é). Número só no
 * pico; os outros aparecem ao passar o mouse ou com ←/→ no gráfico focado.
 * A tabela escondida leva todos os valores para o leitor de tela.
 */
export function NewJobsChart({ days }: { days: DashboardDto['newJobsPerDay'] }) {
  const [active, setActive] = useState<number | null>(null);
  const counts = days.map((day) => day.count);
  const max = Math.max(0, ...counts);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const peak = counts.indexOf(max);
  const { top, step } = niceMax(max);
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step).reverse();
  const last = days.length - 1;

  if (days.length === 0 || total === 0) {
    return <p className={styles.muted}>Nenhuma vaga nova nos últimos {days.length || 14} dias.</p>;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setActive((current) => {
      const from = current ?? (event.key === 'ArrowLeft' ? days.length : -1);
      return Math.min(last, Math.max(0, from + (event.key === 'ArrowLeft' ? -1 : 1)));
    });
  }

  const shown = active ?? null;
  const peakDay = dayLabel(days[peak]!.date);

  return (
    <div className={styles.chartWrap}>
      <div
        className={styles.chart}
        tabIndex={0}
        role="img"
        aria-label={`Vagas novas por dia nos últimos ${days.length} dias: ${vagas(total)} no total, pico de ${formatNumber(max)} em ${peakDay.short}. Use as setas para ver cada dia.`}
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
            {days.map((day, index) => {
              const height = (day.count / top) * 100;
              const isActive = shown === index;
              return (
                <div
                  key={day.date}
                  className={styles.slot}
                  data-active={isActive || undefined}
                  onPointerEnter={() => setActive(index)}
                >
                  {index === peak && !isActive && (
                    <span className={styles.peakLabel} style={{ bottom: `${height}%` }}>
                      {formatNumber(day.count)}
                    </span>
                  )}
                  {isActive && (
                    <span
                      className={styles.tooltip}
                      style={{ bottom: `${height}%` }}
                      data-edge={index < 2 ? 'start' : index > last - 2 ? 'end' : undefined}
                    >
                      <strong>{formatNumber(day.count)}</strong>
                      <span>{dayLabel(day.date).long}</span>
                    </span>
                  )}
                  <span className={styles.column} style={{ height: `${height}%` }} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className={styles.xAxis} aria-hidden="true">
        <span>{dayLabel(days[0]!.date).short}</span>
        <span>hoje</span>
      </div>
      <p className="sr-only" aria-live="polite">
        {shown !== null && `${dayLabel(days[shown]!.date).long}: ${vagas(days[shown]!.count)}`}
      </p>
      {/* Tabela não respeita width/height de 1px: o recorte fica num div. */}
      <div className="sr-only">
        <table>
          <caption>Vagas novas por dia</caption>
          <thead>
            <tr>
              <th scope="col">Dia</th>
              <th scope="col">Vagas novas</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.date}>
                <td>{dayLabel(day.date).long}</td>
                <td>{day.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- funil */

const FUNNEL_STEPS = [
  { key: 'applied', label: 'Aplicada' },
  { key: 'inProcess', label: 'Em processo' },
  { key: 'offer', label: 'Proposta' },
] as const;

/** "% da etapa anterior" (vazio na primeira ou com a anterior zerada). */
export function funnelRows(funnel: DashboardDto['funnel']) {
  return FUNNEL_STEPS.map((step, index) => {
    const value = funnel[step.key];
    const previous = index > 0 ? funnel[FUNNEL_STEPS[index - 1]!.key] : null;
    return {
      ...step,
      value,
      width: funnel.applied > 0 ? (value / funnel.applied) * 100 : 0,
      share: previous ? Math.round((value / previous) * 100) : null,
    };
  });
}

/** Aplicada → Em processo → Proposta: todo valor já está escrito, sem dica. */
export function Funnel({
  funnel,
  medianDays,
}: {
  funnel: DashboardDto['funnel'];
  medianDays: number | null;
}) {
  if (funnel.applied === 0) {
    return (
      <p className={styles.muted}>
        Nenhuma candidatura ainda. Em Vagas, abra uma vaga e clique em "Me candidatei" para começar
        o funil.
      </p>
    );
  }

  return (
    <>
      <ol className={styles.funnel}>
        {funnelRows(funnel).map((row) => (
          <li key={row.key} className={styles.funnelRow}>
            <div className={styles.funnelText}>
              <span>{row.label}</span>
              <span>
                <strong>{formatNumber(row.value)}</strong>
                {row.share !== null && (
                  <span className={styles.muted}> · {row.share}% da etapa anterior</span>
                )}
              </span>
            </div>
            <div className={styles.funnelTrack} aria-hidden="true">
              <span className={styles.funnelBar} style={{ width: `${row.width}%` }} />
            </div>
          </li>
        ))}
      </ol>
      <p className={styles.muted}>
        Tempo até a primeira resposta:{' '}
        {medianDays === null ? (
          'ainda sem resposta'
        ) : (
          <strong className={styles.strong}>
            {medianDays.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}{' '}
            {medianDays === 1 ? 'dia' : 'dias'}
          </strong>
        )}{' '}
        (mediana)
      </p>
    </>
  );
}
