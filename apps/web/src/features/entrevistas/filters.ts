import {
  foldText,
  INTERVIEW_CATEGORIES,
  type InterviewCategory,
  type InterviewQuestionDto,
} from '@busca-vagas/shared';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

/**
 * Filtros da tela de Entrevistas, na URL e em português:
 * /entrevistas?categoria=comportamental&situacao=treinar&tag=react&busca=conflito
 */

export type QuestionStatus = 'unanswered' | 'answered' | 'practice';

export interface QuestionFilters {
  q?: string;
  category?: InterviewCategory;
  status?: QuestionStatus;
  tag?: string;
}

const CATEGORY_PARAM: Record<InterviewCategory, string> = {
  hr: 'rh',
  behavioral: 'comportamental',
  technical: 'tecnica',
  company: 'empresa',
};
const STATUS_PARAM: Record<QuestionStatus, string> = {
  unanswered: 'sem-resposta',
  answered: 'respondidas',
  practice: 'treinar',
};
const fromParam = <T extends string>(map: Record<T, string>, value: string | null) =>
  (Object.entries(map) as [T, string][]).find(([, param]) => param === value)?.[0];

export const categoryParam = (category: InterviewCategory) => CATEGORY_PARAM[category];

export function filtersFromParams(params: URLSearchParams): QuestionFilters {
  return {
    q: params.get('busca')?.trim() || undefined,
    category: fromParam(CATEGORY_PARAM, params.get('categoria')),
    status: fromParam(STATUS_PARAM, params.get('situacao')),
    tag: params.get('tag')?.trim().toLowerCase() || undefined,
  };
}

/** "Para treinar" = a última avaliação no treino foi "preciso treinar". */
export const needsPractice = (question: InterviewQuestionDto) =>
  question.practice.lastRating === 'again';

const searchable = (question: InterviewQuestionDto) =>
  foldText(
    [
      question.question,
      question.answer,
      question.starSituation,
      question.starTask,
      question.starAction,
      question.starResult,
      ...question.tags,
    ]
      .filter(Boolean)
      .join(' '),
  );

/** Filtro na hora, sem ir à API (o banco tem dezenas de perguntas). */
export function filterQuestions(
  list: readonly InterviewQuestionDto[],
  filters: QuestionFilters,
): InterviewQuestionDto[] {
  const words = filters.q ? foldText(filters.q).split(' ') : [];
  return list.filter((question) => {
    if (filters.category && question.category !== filters.category) return false;
    if (filters.tag && !question.tags.includes(filters.tag)) return false;
    if (filters.status === 'unanswered' && question.answered) return false;
    if (filters.status === 'answered' && !question.answered) return false;
    if (filters.status === 'practice' && !needsPractice(question)) return false;
    if (words.length > 0) {
      const text = searchable(question);
      if (!words.every((word) => text.includes(word))) return false;
    }
    return true;
  });
}

export function countByCategory(list: readonly InterviewQuestionDto[]) {
  const counts = Object.fromEntries(
    INTERVIEW_CATEGORIES.map((category) => [category, 0]),
  ) as Record<InterviewCategory, number>;
  for (const question of list) counts[question.category] += 1;
  return counts;
}

export function useQuestionFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(params), [params]);

  const setParam = useCallback(
    (name: string, value: string | undefined, options: { replace?: boolean } = {}) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value) next.set(name, value);
          else next.delete(name);
          return next;
        },
        { replace: options.replace },
      ),
    [setParams],
  );

  return useMemo(
    () => ({
      filters,
      /** Pergunta aberta no editor: id, ou "nova". */
      openId: params.get('pergunta'),
      setQuery: (q: string) => setParam('busca', q.trim() || undefined, { replace: true }),
      setCategory: (category: InterviewCategory | undefined) =>
        setParam('categoria', category && CATEGORY_PARAM[category]),
      setStatus: (status: QuestionStatus | undefined) =>
        setParam('situacao', status && STATUS_PARAM[status]),
      setTag: (tag: string | undefined) => setParam('tag', tag),
      open: (id: string) => setParam('pergunta', id),
      close: () => setParam('pergunta', undefined),
    }),
    [filters, params, setParam],
  );
}
