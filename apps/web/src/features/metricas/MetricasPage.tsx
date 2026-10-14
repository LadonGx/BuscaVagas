import {
  DEFAULT_METRICS_PERIOD,
  METRICS_PERIODS,
  rate,
  WAITING_STALE_DAYS,
  type MetricsDto,
  type MetricsPeriod,
} from '@busca-vagas/shared';
import { Link, useSearchParams } from 'react-router';
import { useSourceName } from '../../api/discovery';
import { useMetrics } from '../../api/metrics';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { formatDate, formatNumber } from '../../lib/format';
import { BarList, stackRow, WeeklyChart } from './Charts';
import styles from './Metricas.module.css';

const PERIOD_PARAM: Record<MetricsPeriod, string> = { 30: '30', 90: '90', 0: 'tudo' };
const PERIOD_LABEL: Record<MetricsPeriod, string> = { 30: '30 dias', 90: '90 dias', 0: 'Tudo' };

export function periodFromParam(value: string | null): MetricsPeriod {
  const found = METRICS_PERIODS.find((period) => PERIOD_PARAM[period] === value);
  return found ?? DEFAULT_METRICS_PERIOD;
}

const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
/** "menos de 1 dia", "1 dia", "4,5 dias". */
export const formatDays = (value: number) =>
  value < 1 ? 'menos de 1 dia' : `${decimal.format(value)} ${value === 1 ? 'dia' : 'dias'}`;
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Métricas (docs/features/17-metrics.md): o que está funcionando na busca
 * e nas candidaturas, no período escolhido (`?periodo=30|90|tudo`).
 */
export function MetricasPage() {
  const [params, setParams] = useSearchParams();
  const period = periodFromParam(params.get('periodo'));
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useMetrics(period);

  const setPeriod = (next: MetricsPeriod) =>
    setParams((current) => {
      const updated = new URLSearchParams(current);
      if (next === DEFAULT_METRICS_PERIOD) updated.delete('periodo');
      else updated.set('periodo', PERIOD_PARAM[next]);
      return updated;
    });

  const subtitle = data?.since
    ? `Desde ${formatDate(data.since)} · vagas pela entrada no app, candidaturas pela data em que você aplicou`
    : 'Desde o começo · vagas pela entrada no app, candidaturas pela data em que você aplicou';

  return (
    <>
      <PageHeader
        title="Métricas"
        subtitle={subtitle}
        actions={
          <div className={styles.periods} role="group" aria-label="Período">
            {METRICS_PERIODS.map((value) => (
              <button
                key={value}
                type="button"
                className={styles.period}
                aria-pressed={period === value}
                onClick={() => setPeriod(value)}
              >
                {PERIOD_LABEL[value]}
              </button>
            ))}
          </div>
        }
      />

      {isPending ? (
        <p className={styles.muted}>Calculando…</p>
      ) : isError ? (
        <EmptyState title="Não consegui calcular as métricas">
          <p>{error.message}</p>
          <Button onClick={() => void refetch()}>Tentar de novo</Button>
        </EmptyState>
      ) : (
        <div className={styles.page} aria-busy={isPlaceholderData || undefined}>
          <Summary data={data} />

          <section className={styles.card} aria-labelledby="semanas">
            <h2 id="semanas" className={styles.cardTitle}>
              Candidaturas por semana
            </h2>
            <WeeklyChart weeks={data.weekly} />
          </section>

          <div className={styles.columnsGrid}>
            <Responses responses={data.responses} />
            <Sources sources={data.sources} />
          </div>

          <div className={styles.columnsGrid}>
            <section className={styles.card} aria-labelledby="stacks-mercado">
              <div className={styles.cardHead}>
                <h2 id="stacks-mercado" className={styles.cardTitle}>
                  Stacks mais pedidas
                </h2>
                <span className={styles.muted}>
                  em {formatNumber(data.stacks.jobs)} {data.stacks.jobs === 1 ? 'vaga' : 'vagas'}{' '}
                  que entraram
                </span>
              </div>
              {data.stacks.top.length === 0 ? (
                <p className={styles.muted}>Nenhuma vaga com stack reconhecida no período.</p>
              ) : (
                <BarList
                  label="Stacks mais pedidas"
                  rows={data.stacks.top.map((stack) => stackRow(stack))}
                />
              )}
            </section>

            <section className={styles.card} aria-labelledby="stacks-faltam">
              <div className={styles.cardHead}>
                <h2 id="stacks-faltam" className={styles.cardTitle}>
                  Faltam no seu currículo
                </h2>
                <Link to="/curriculo" className={styles.more}>
                  Currículo
                </Link>
              </div>
              {!data.stacks.resumeHasStacks ? (
                <p className={styles.muted}>
                  Nenhuma tecnologia reconhecida nas Competências do currículo. Preencha a seção
                  para ver o que as vagas pedem e você ainda não mostra.
                </p>
              ) : data.stacks.missing.length === 0 ? (
                <p className={styles.muted}>
                  Seu currículo já cita todas as stacks pedidas no período.
                </p>
              ) : (
                <>
                  <p className={styles.muted}>
                    As mais pedidas que não aparecem nas suas Competências — se você já usa, vale
                    citar; se não, é o que estudar.
                  </p>
                  <BarList
                    label="Stacks que faltam no currículo"
                    rows={data.stacks.missing.map((stack) => stackRow(stack, false))}
                  />
                </>
              )}
            </section>
          </div>
        </div>
      )}
    </>
  );
}

function Summary({ data }: { data: MetricsDto }) {
  const { responses } = data;
  const answerRate = rate(responses.responded, responses.applications);
  const tiles = [
    {
      key: 'vagas',
      value: formatNumber(data.stacks.jobs),
      label: 'Vagas que entraram',
      hint: `${formatNumber(data.sources.filter((source) => source.found > 0).length)} fontes`,
    },
    {
      key: 'candidaturas',
      value: formatNumber(responses.applications),
      label: responses.applications === 1 ? 'Candidatura' : 'Candidaturas',
      hint: `${formatNumber(responses.responded)} com resposta`,
    },
    {
      key: 'taxa',
      value: answerRate === null ? '—' : `${answerRate}%`,
      label: 'Taxa de resposta',
      hint: 'processo, proposta ou recusa',
    },
    {
      key: 'mediana',
      value: responses.medianDays === null ? '—' : formatDays(responses.medianDays),
      label: 'Até a resposta',
      hint: 'mediana',
    },
  ];
  return (
    <section aria-label="Resumo do período" className={styles.stats}>
      {tiles.map((tile) => (
        <div key={tile.key} className={styles.stat}>
          <span className={styles.statValue}>{tile.value}</span>
          <span className={styles.statLabel}>{tile.label}</span>
          <span className={styles.muted}>{tile.hint}</span>
        </div>
      ))}
    </section>
  );
}

function Responses({ responses }: { responses: MetricsDto['responses'] }) {
  return (
    <section className={styles.card} aria-labelledby="resposta">
      <h2 id="resposta" className={styles.cardTitle}>
        Tempo até a resposta
      </h2>
      {responses.responded === 0 ? (
        <p className={styles.muted}>
          Nenhuma resposta no período ainda. Registre as etapas (processo, proposta, recusa) no
          painel da candidatura.
        </p>
      ) : (
        <BarList
          label="Respostas por tempo de espera"
          rows={responses.buckets.map((bucket) => ({
            key: bucket.label,
            label: bucket.label,
            value: bucket.count,
            text: `${formatNumber(bucket.count)} (${rate(bucket.count, responses.responded)}%)`,
          }))}
        />
      )}
      {responses.waiting > 0 && (
        <p className={styles.note}>
          {formatNumber(responses.waiting)}{' '}
          {responses.waiting === 1 ? 'candidatura sem resposta' : 'candidaturas sem resposta'}
          {responses.waitingStale > 0 &&
            ` — ${formatNumber(responses.waitingStale)} há mais de ${WAITING_STALE_DAYS} dias`}
          . <Link to="/candidaturas?vista=lista">Ver candidaturas</Link>
        </p>
      )}
    </section>
  );
}

function Sources({ sources }: { sources: MetricsDto['sources'] }) {
  const sourceName = useSourceName();
  return (
    <section className={styles.card} aria-labelledby="fontes">
      <h2 id="fontes" className={styles.cardTitle}>
        Rendimento por fonte
      </h2>
      {sources.length === 0 ? (
        <p className={styles.muted}>Nenhuma vaga no período.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-labelledby="fontes">
            <thead>
              <tr>
                <th scope="col">Fonte</th>
                <th scope="col">Vagas</th>
                <th scope="col">Compatíveis</th>
                <th scope="col">Salvas</th>
                <th scope="col">Candidaturas</th>
                <th scope="col">Resposta</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => {
                const answer = rate(source.responded, source.applied);
                return (
                  <tr key={source.sourceId}>
                    <th scope="row">{capitalize(sourceName(source.sourceId))}</th>
                    <td>{formatNumber(source.found)}</td>
                    <td>
                      {formatNumber(source.compatible)}
                      {source.found > 0 && (
                        <span className={styles.share}>
                          {' '}
                          {rate(source.compatible, source.found)}%
                        </span>
                      )}
                    </td>
                    <td>{formatNumber(source.saved)}</td>
                    <td>{formatNumber(source.applied)}</td>
                    <td>
                      {answer === null ? '—' : `${formatNumber(source.responded)} (${answer}%)`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className={styles.muted}>
        Vagas e salvas contam pela entrada no período; candidaturas, pela data em que você aplicou.
        Descartadas que a limpeza apagou não entram.
      </p>
    </section>
  );
}
