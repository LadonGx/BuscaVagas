import { describe, expect, it } from 'vitest';
import {
  createInterviewQuestionInputSchema,
  isAnswered,
  parseTags,
  pickPracticeQuestion,
  practiceWeight,
  updateInterviewQuestionInputSchema,
  type InterviewQuestionDto,
} from './interviews';

const NOW = new Date('2026-10-15T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

const q = (
  id: string,
  practice: Partial<InterviewQuestionDto['practice']> = {},
): Pick<InterviewQuestionDto, 'id' | 'practice'> => ({
  id,
  practice: { count: 0, lastRating: null, practicedAt: null, ...practice },
});

describe('perguntas de entrevista', () => {
  it('tags: minúsculas, sem repetição nem vazias', () => {
    expect(parseTags(' React, conflito ,react,, Banco  de dados ')).toEqual([
      'react',
      'conflito',
      'banco de dados',
    ]);
  });

  it('entrada: texto vazio vira null; PATCH vazio é recusado', () => {
    const parsed = createInterviewQuestionInputSchema.parse({
      question: '  Fale de você.  ',
      category: 'hr',
      answer: '   ',
      tags: ['RH'],
    });
    expect(parsed).toMatchObject({ question: 'Fale de você.', answer: null, tags: ['rh'] });
    expect(updateInterviewQuestionInputSchema.safeParse({}).success).toBe(false);
  });

  it('respondida: texto ou algum campo STAR', () => {
    const empty = {
      answer: null,
      starSituation: null,
      starTask: null,
      starAction: null,
      starResult: null,
    };
    expect(isAnswered(empty)).toBe(false);
    expect(isAnswered({ ...empty, answer: '  ' })).toBe(false);
    expect(isAnswered({ ...empty, starAction: 'Refatorei.' })).toBe(true);
  });
});

describe('treino', () => {
  it('peso: "preciso treinar" > nunca treinada > fui bem há tempo > fui bem agora', () => {
    const again = practiceWeight(q('a', { lastRating: 'again', practicedAt: daysAgo(0) }), NOW);
    const never = practiceWeight(q('b'), NOW);
    const oldGood = practiceWeight(q('c', { lastRating: 'good', practicedAt: daysAgo(20) }), NOW);
    const newGood = practiceWeight(q('d', { lastRating: 'good', practicedAt: daysAgo(1) }), NOW);
    expect(again).toBeGreaterThan(never);
    expect(never).toBeGreaterThan(oldGood);
    expect(oldGood).toBeGreaterThan(newGood);
  });

  it('sorteio pelo peso e sem repetir na sessão; vista tudo, recomeça', () => {
    const pool = [
      q('fui-bem', { lastRating: 'good', practicedAt: daysAgo(1) }), // 0,5
      q('treinar', { lastRating: 'again', practicedAt: daysAgo(1) }), // 6
    ];
    expect(pickPracticeQuestion(pool, new Set(), () => 0, NOW)?.id).toBe('fui-bem');
    expect(pickPracticeQuestion(pool, new Set(), () => 0.5, NOW)?.id).toBe('treinar');
    expect(pickPracticeQuestion(pool, new Set(['treinar']), () => 0.99, NOW)?.id).toBe('fui-bem');
    expect(pickPracticeQuestion(pool, new Set(['treinar', 'fui-bem']), () => 0.99, NOW)?.id).toBe(
      'treinar',
    );
    expect(pickPracticeQuestion([], new Set())).toBeNull();
  });
});
