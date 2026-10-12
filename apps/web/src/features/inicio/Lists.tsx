import {
  WORK_MODEL_LABELS,
  type ApplicationDto,
  type JobDto,
  type PreferencesDto,
} from '@busca-vagas/shared';
import { Check, Circle } from 'lucide-react';
import { Link } from 'react-router';
import { ApplicationStatusChip } from '../../components/job/Chips';
import { ScoreBadge } from '../../components/job/ScoreBadge';
import { formatAgo } from '../../lib/format';
import { jobDate } from '../vagas/JobCard';
import styles from './Inicio.module.css';

/* --------------------------------------------- melhores vagas novas */

export function TopNew({
  jobs,
  now,
  onOpen,
}: {
  jobs: JobDto[];
  now: Date;
  onOpen: (jobId: string) => void;
}) {
  if (jobs.length === 0) {
    return (
      <p className={styles.muted}>
        Nenhuma vaga nova com nota nos últimos 7 dias. Busque vagas ou ajuste as preferências.
      </p>
    );
  }
  return (
    <ul className={styles.list}>
      {jobs.map((job) => {
        const place = [job.workModel && WORK_MODEL_LABELS[job.workModel], job.location]
          .filter(Boolean)
          .join(' · ');
        return (
          <li key={job.id}>
            <button type="button" className={styles.row} onClick={() => onOpen(job.id)}>
              <ScoreBadge job={job} />
              <span className={styles.rowText}>
                <span className={styles.rowTitle}>{job.title}</span>
                <span className={styles.muted}>
                  {job.company}
                  {place && ` · ${place}`}
                </span>
              </span>
              <span className={styles.rowWhen}>{formatAgo(jobDate(job), now)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------------------------------------------- próximas etapas */

const weekdayFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

/** "hoje" / "amanhã" / "qui." e o dia do mês; hora só quando não é meia-noite. */
export function stepWhen(
  iso: string,
  now: Date,
): { top: string; day: string; time: string | null } {
  const date = new Date(iso);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const top = sameDay(date, now)
    ? 'hoje'
    : sameDay(date, tomorrow)
      ? 'amanhã'
      : weekdayFmt.format(date).replace('.', '');
  const midnight = date.getHours() === 0 && date.getMinutes() === 0;
  return { top, day: String(date.getDate()), time: midnight ? null : timeFmt.format(date) };
}

export function UpcomingSteps({ steps, now }: { steps: ApplicationDto[]; now: Date }) {
  if (steps.length === 0) {
    return (
      <p className={styles.muted}>
        Nenhuma etapa marcada. Em Candidaturas, abra uma candidatura e use "Marcar próxima etapa".
      </p>
    );
  }
  return (
    <ul className={styles.list}>
      {steps.map((step) => {
        const when = stepWhen(step.nextStepAt!, now);
        const what = [step.nextStepNote || 'Próxima etapa', when.time].filter(Boolean).join(' · ');
        return (
          <li key={step.id}>
            <Link to={`/candidaturas/${step.id}`} className={styles.row}>
              <span className={styles.date} aria-hidden="true">
                <span>{when.top}</span>
                <strong>{when.day}</strong>
              </span>
              <span className={styles.rowText}>
                <span className="sr-only">{`${when.top} dia ${when.day}: `}</span>
                <span className={styles.rowTitle}>{what}</span>
                <span className={styles.muted}>
                  {step.job.title} · {step.job.company}
                </span>
              </span>
              <ApplicationStatusChip status={step.status} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/* --------------------------------------------------- primeiros passos */

export interface FirstStepsState {
  preferences: PreferencesDto | undefined;
  /** Algum campo, texto ou entrada do currículo preenchido. */
  resumeStarted: boolean | undefined;
  /** Alguma fonte já terminou uma busca com sucesso. */
  searched: boolean | undefined;
}

/** Os três passos; `null` enquanto algo ainda carrega (não pisca o cartão). */
export function firstSteps({ preferences, resumeStarted, searched }: FirstStepsState) {
  if (preferences === undefined || resumeStarted === undefined || searched === undefined) {
    return null;
  }
  return [
    {
      key: 'busca',
      done: searched,
      title: 'Fazer a primeira busca',
      hint: 'Clique em "Buscar agora" — as vagas das fontes ativas entram na caixa.',
      to: null,
    },
    {
      key: 'preferencias',
      done: preferences.configured,
      title: 'Salvar as preferências',
      hint: 'Stacks, senioridade e modalidade: é daí que sai a nota de cada vaga.',
      to: '/preferencias',
    },
    {
      key: 'curriculo',
      done: resumeStarted,
      title: 'Preencher o currículo',
      hint: 'Uma vez só; depois é copiar cada campo no formulário da vaga.',
      to: '/curriculo',
    },
  ];
}

/** Some quando os três estiverem feitos. */
export function FirstSteps(state: FirstStepsState) {
  const steps = firstSteps(state);
  if (!steps || steps.every((step) => step.done)) return null;
  const done = steps.filter((step) => step.done).length;

  return (
    <section className={styles.card} aria-labelledby="primeiros-passos">
      <div className={styles.cardHead}>
        <h2 id="primeiros-passos" className={styles.cardTitle}>
          Primeiros passos
        </h2>
        <span className={styles.muted}>
          {done} de {steps.length} feitos
        </span>
      </div>
      <ol className={styles.steps}>
        {steps.map((step) => (
          <li key={step.key} className={styles.step} data-done={step.done || undefined}>
            {step.done ? (
              <Check size={18} className={styles.stepIcon} aria-hidden="true" />
            ) : (
              <Circle size={18} className={styles.stepIcon} aria-hidden="true" />
            )}
            <span className={styles.rowText}>
              <span className={styles.rowTitle}>
                {step.to && !step.done ? <Link to={step.to}>{step.title}</Link> : step.title}
                <span className="sr-only">{step.done ? ' (feito)' : ' (a fazer)'}</span>
              </span>
              {!step.done && <span className={styles.muted}>{step.hint}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
