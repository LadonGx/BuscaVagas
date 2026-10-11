import {
  APPLICATION_STATUS_LABELS,
  CONTRACT_LABELS,
  SENIORITY_LABELS,
  TRIAGE_LABELS,
  WORK_MODEL_LABELS,
  type ApplicationStatus,
  type JobDto,
  type TriageStatus,
} from '@busca-vagas/shared';
import { formatSalary } from '../../lib/format';
import styles from './Chips.module.css';

type ChipJob = Pick<
  JobDto,
  | 'workModel'
  | 'location'
  | 'contractType'
  | 'seniority'
  | 'salaryMin'
  | 'salaryMax'
  | 'salaryCurrency'
  | 'salaryPeriod'
>;

/** O que se sabe da vaga, na ordem em que se decide: modalidade, local, contrato, nível, salário. */
export function jobChipTexts(job: ChipJob): string[] {
  return [
    job.workModel && WORK_MODEL_LABELS[job.workModel],
    job.location,
    job.contractType && CONTRACT_LABELS[job.contractType],
    job.seniority && SENIORITY_LABELS[job.seniority],
    formatSalary(job),
  ].filter((text): text is string => Boolean(text));
}

export function JobChips({ job }: { job: ChipJob }) {
  const texts = jobChipTexts(job);
  if (texts.length === 0) return null;

  return (
    <ul className={styles.row} aria-label="Detalhes da vaga">
      {texts.map((text) => (
        <li key={text} className={styles.chip}>
          {text}
        </li>
      ))}
    </ul>
  );
}

/** Stacks em fonte mono; acima de `max`, um "+N" com o resto na dica. */
export function StackChips({ stack, max = 4 }: { stack: readonly string[]; max?: number }) {
  if (stack.length === 0) return null;

  const shown = stack.slice(0, max);
  const rest = stack.slice(max);

  return (
    <ul className={styles.row} aria-label="Stack">
      {shown.map((tech) => (
        <li key={tech} className={styles.tech}>
          {tech}
        </li>
      ))}
      {rest.length > 0 && (
        <li className={styles.more} title={rest.join(', ')}>
          +{rest.length}
          <span className="sr-only">: {rest.join(', ')}</span>
        </li>
      )}
    </ul>
  );
}

type StatusKey = TriageStatus | ApplicationStatus;

const STATUS_TONE: Record<StatusKey, string> = {
  inbox: 'weak',
  saved: 'accent',
  dismissed: 'bad',
  applied: 'info',
  in_process: 'good',
  offer: 'great',
  rejected: 'bad',
  withdrawn: 'weak',
};

/** Onde a vaga está: a candidatura manda; sem ela, a triagem. */
export function jobStatus(job: Pick<JobDto, 'triage' | 'application'>): {
  key: StatusKey;
  label: string;
} {
  if (job.application) {
    return {
      key: job.application.status,
      label: APPLICATION_STATUS_LABELS[job.application.status],
    };
  }
  return { key: job.triage, label: TRIAGE_LABELS[job.triage] };
}

export function StatusChip({ job }: { job: Pick<JobDto, 'triage' | 'application'> }) {
  const { key, label } = jobStatus(job);
  return (
    <span className={styles.status}>
      <span className={styles.dot} data-tone={STATUS_TONE[key]} aria-hidden="true" />
      {label}
    </span>
  );
}
