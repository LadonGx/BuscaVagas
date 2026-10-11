import type { ScoreReason } from '@busca-vagas/shared';
import { describe, expect, it } from 'vitest';
import { cardReasons, scoreLabel, scoreText, type ScoredJob } from './score';

const job = (overrides: Partial<ScoredJob> = {}): ScoredJob => ({
  score: 912,
  scoreCoverage: 100,
  scoreReasons: [],
  incompatible: false,
  scorePending: false,
  ...overrides,
});

const plus = (criterion: ScoreReason['criterion'], text: string): ScoreReason => ({
  criterion,
  kind: 'plus',
  text,
});
const minus = (criterion: ScoreReason['criterion'], text: string): ScoreReason => ({
  criterion,
  kind: 'minus',
  text,
});

describe('texto da nota', () => {
  it('número, zero, calculando e sem nota', () => {
    expect(scoreText(job())).toBe('912');
    expect(scoreText(job({ score: 0, incompatible: true }))).toBe('0');
    expect(scoreText(job({ scorePending: true }))).toBe('…');
    expect(scoreText(job({ score: null }))).toBe('—');
  });

  it('frase para leitor de tela', () => {
    expect(scoreLabel(job({ scoreCoverage: 45 }))).toBe(
      'Nota 912 de 1000, sobre 45% dos critérios',
    );
    expect(scoreLabel(job({ incompatible: true, score: 0 }))).toMatch(/Incompatível/);
    expect(scoreLabel(job({ scorePending: true }))).toBe('Nota sendo calculada');
    expect(scoreLabel(job({ score: null }))).toMatch(/configure suas preferências/);
  });
});

describe('motivos do cartão', () => {
  it('o a favor mais importante (stack) e o primeiro contra', () => {
    const reasons = cardReasons(
      job({
        scoreReasons: [
          plus('workModel', 'Remota'),
          minus('seniority', 'Pleno (você busca júnior)'),
          plus('stack', 'Node.js, React'),
        ],
      }),
    );
    expect(reasons.map((r) => r.text)).toEqual(['Node.js, React', 'Pleno (você busca júnior)']);
  });

  it('incompatível mostra só o bloqueio', () => {
    const reasons = cardReasons(
      job({
        score: 0,
        incompatible: true,
        scoreReasons: [
          plus('stack', 'PHP'),
          { criterion: 'stack', kind: 'block', text: 'Stack evitada no título: php' },
        ],
      }),
    );
    expect(reasons).toEqual([
      { criterion: 'stack', kind: 'block', text: 'Stack evitada no título: php' },
    ]);
  });

  it('pouca cobertura troca o contra pelo aviso', () => {
    const reasons = cardReasons(
      job({
        scoreCoverage: 45,
        scoreReasons: [plus('stack', 'Node.js'), minus('contract', 'PJ')],
      }),
    );
    expect(reasons.map((r) => [r.kind, r.text])).toEqual([
      ['plus', 'Node.js'],
      ['unknown', 'Nota sobre 45% dos critérios'],
    ]);
  });

  it('calculando ou sem nota: nada', () => {
    expect(cardReasons(job({ scorePending: true, scoreReasons: [plus('stack', 'x')] }))).toEqual(
      [],
    );
    expect(cardReasons(job({ score: null }))).toEqual([]);
  });
});
