import {
  MAX_SCORE,
  scoreTier,
  type JobDto,
  type ScoreCriterion,
  type ScoreReason,
  type ScoreReasonKind,
  type ScoreTier,
} from '@busca-vagas/shared';

/**
 * Como a nota aparece na tela. As faixas vêm do `shared` (`scoreTier`), as
 * mesmas que a API usa em `/jobs/counts` — cor e número nunca divergem.
 */

export type ScoredJob = Pick<
  JobDto,
  'score' | 'scoreCoverage' | 'scoreReasons' | 'incompatible' | 'scorePending'
>;

/** Tom de cor de cada faixa (nomes dos tokens em styles/tokens.css). */
export type Tone = 'great' | 'good' | 'weak' | 'bad' | 'pending' | 'none';

export const TIER_TONE: Record<ScoreTier, Tone> = {
  great: 'great',
  good: 'good',
  weak: 'weak',
  incompatible: 'bad',
  pending: 'pending',
  unscored: 'none',
};

/** Abaixo disto a nota se apoia em pouca informação e o cartão avisa. */
export const LOW_COVERAGE = 60;

/** O que vai dentro do selo: número, 0, "…" (calculando) ou "—" (sem nota). */
export function scoreText(job: ScoredJob): string {
  switch (scoreTier(job)) {
    case 'pending':
      return '…';
    case 'unscored':
      return '—';
    case 'incompatible':
      return '0';
    default:
      return String(job.score);
  }
}

/** Frase completa para leitor de tela e dica ao passar o mouse. */
export function scoreLabel(job: ScoredJob): string {
  switch (scoreTier(job)) {
    case 'pending':
      return 'Nota sendo calculada';
    case 'unscored':
      return 'Sem nota: configure suas preferências';
    case 'incompatible':
      return 'Incompatível com suas preferências: nota 0';
    default: {
      const coverage = job.scoreCoverage ?? 0;
      return `Nota ${job.score} de ${MAX_SCORE}, sobre ${coverage}% dos critérios`;
    }
  }
}

export const REASON_MARK: Record<ScoreReasonKind, string> = {
  plus: '+',
  minus: '−',
  unknown: '?',
  block: '×',
};

export const REASON_TONE: Record<ScoreReasonKind, Tone> = {
  plus: 'great',
  minus: 'good',
  unknown: 'weak',
  block: 'bad',
};

/** O que o símbolo quer dizer, para quem não vê a cor nem o sinal. */
export const REASON_MEANING: Record<ScoreReasonKind, string> = {
  plus: 'A favor',
  minus: 'Contra',
  unknown: 'Sem informação',
  block: 'Incompatível',
};

/** Ordem de importância no resumo do cartão (a stack pesa mais). */
const CRITERION_ORDER: ScoreCriterion[] = [
  'company',
  'stack',
  'seniority',
  'workModel',
  'contract',
  'salary',
  'recency',
];

function byImportance(a: ScoreReason, b: ScoreReason): number {
  return CRITERION_ORDER.indexOf(a.criterion) - CRITERION_ORDER.indexOf(b.criterion);
}

/**
 * Até dois motivos para o cartão, em uma linha:
 * - incompatível: só o bloqueio (é o que importa);
 * - senão: o ponto a favor mais importante e o primeiro contra;
 * - com pouca cobertura, o segundo vira o aviso "nota sobre X% dos critérios".
 */
export function cardReasons(job: ScoredJob): ScoreReason[] {
  const tier = scoreTier(job);
  if (tier === 'pending' || tier === 'unscored') return [];

  const reasons = [...job.scoreReasons].sort(byImportance);
  if (tier === 'incompatible') {
    return reasons.filter((reason) => reason.kind === 'block').slice(0, 1);
  }

  const plus = reasons.find((reason) => reason.kind === 'plus');
  const minus = reasons.find((reason) => reason.kind === 'minus');
  const coverage = job.scoreCoverage ?? 100;
  const lowCoverage: ScoreReason | undefined =
    coverage < LOW_COVERAGE
      ? { criterion: 'stack', kind: 'unknown', text: `Nota sobre ${coverage}% dos critérios` }
      : undefined;

  return [plus, lowCoverage ?? minus].filter((reason): reason is ScoreReason => Boolean(reason));
}
