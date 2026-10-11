import { scoreTier } from '@busca-vagas/shared';
import { scoreLabel, scoreText, TIER_TONE, type ScoredJob } from '../../lib/score';
import styles from './ScoreBadge.module.css';

interface ScoreBadgeProps {
  job: ScoredJob;
  /** `lg` no painel de detalhe e no Deslizar. */
  size?: 'sm' | 'lg';
}

/**
 * Selo da nota: número na cor da faixa e, embaixo, a barra de cobertura
 * (quanto dos critérios a vaga informa). A frase completa vai para o leitor
 * de tela e para a dica ao passar o mouse.
 */
export function ScoreBadge({ job, size = 'sm' }: ScoreBadgeProps) {
  const tier = scoreTier(job);
  const label = scoreLabel(job);
  const showCoverage = tier !== 'pending' && tier !== 'unscored';

  return (
    <div
      className={styles.badge}
      data-tone={TIER_TONE[tier]}
      data-size={size}
      role="img"
      aria-label={label}
      title={label}
    >
      <span className={styles.value}>{scoreText(job)}</span>
      {showCoverage && (
        <span className={styles.track}>
          <span className={styles.coverage} style={{ width: `${job.scoreCoverage ?? 0}%` }} />
        </span>
      )}
    </div>
  );
}
