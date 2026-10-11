import type { ScoreReason } from '@busca-vagas/shared';
import { REASON_MARK, REASON_MEANING, REASON_TONE } from '../../lib/score';
import styles from './ReasonList.module.css';

export function ReasonMark({ kind }: { kind: ScoreReason['kind'] }) {
  return (
    <span className={styles.mark} data-tone={REASON_TONE[kind]} aria-hidden="true">
      {REASON_MARK[kind]}
    </span>
  );
}

/** "Por que essa nota": cada motivo com + − ? × e o texto. */
export function ReasonList({ reasons }: { reasons: readonly ScoreReason[] }) {
  if (reasons.length === 0) return null;

  return (
    <ul className={styles.list}>
      {reasons.map((reason, index) => (
        <li key={`${reason.criterion}-${index}`} className={styles.item}>
          <ReasonMark kind={reason.kind} />
          <span>
            <span className="sr-only">{REASON_MEANING[reason.kind]}: </span>
            {reason.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Versão de uma linha para o cartão: "+ Node.js, React · − Pleno". */
export function ReasonLine({ reasons }: { reasons: readonly ScoreReason[] }) {
  if (reasons.length === 0) return null;

  return (
    <p className={styles.line}>
      {reasons.map((reason, index) => (
        <span key={`${reason.criterion}-${index}`} className={styles.lineItem}>
          <ReasonMark kind={reason.kind} />
          <span className="sr-only">{REASON_MEANING[reason.kind]}: </span>
          {reason.text}
        </span>
      ))}
    </p>
  );
}
