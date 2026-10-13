import { z } from 'zod';

/**
 * Banco de perguntas de entrevista com as suas respostas, ligado às
 * candidaturas e com modo treino.
 * Plano: docs/features/15-interview-questions.md
 */

export const INTERVIEW_CATEGORIES = ['hr', 'behavioral', 'technical', 'company'] as const;
export const interviewCategorySchema = z.enum(INTERVIEW_CATEGORIES);
export type InterviewCategory = z.infer<typeof interviewCategorySchema>;

export const INTERVIEW_CATEGORY_LABELS: Record<InterviewCategory, string> = {
  hr: 'RH',
  behavioral: 'Comportamental',
  technical: 'Técnica',
  company: 'Sobre a empresa',
};

/** Avaliação no treino: "fui bem" ou "preciso treinar". */
export const PRACTICE_RATINGS = ['good', 'again'] as const;
export const practiceRatingSchema = z.enum(PRACTICE_RATINGS);
export type PracticeRating = z.infer<typeof practiceRatingSchema>;

export const MAX_TAGS = 10;

/** Tags em minúsculas, sem espaço sobrando nem repetição ("React " e "react" = "react"). */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const tag of tags) {
    const clean = tag.trim().replace(/\s+/g, ' ').toLowerCase();
    if (clean) seen.add(clean);
  }
  return [...seen];
}

/** "react, Conflito ,  react" → ["react", "conflito"]. */
export const parseTags = (text: string) => normalizeTags(text.split(','));

const longText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .optional();

const tagsSchema = z
  .array(z.string().max(30, 'Tag com mais de 30 letras'))
  .transform(normalizeTags)
  .pipe(z.array(z.string()).max(MAX_TAGS, `No máximo ${MAX_TAGS} tags`));

const questionFields = {
  question: z.string().trim().min(3, 'Escreva a pergunta').max(500),
  category: interviewCategorySchema,
  tags: tagsSchema.optional(),
  answer: longText(10_000),
  /** STAR (nas comportamentais): Situação, Tarefa, Ação e Resultado. */
  starSituation: longText(3_000),
  starTask: longText(3_000),
  starAction: longText(3_000),
  starResult: longText(3_000),
};

export const createInterviewQuestionInputSchema = z.object({
  ...questionFields,
  /** Já marca como "caiu nesta entrevista" (adicionada pelo painel da candidatura). */
  askedIn: z.string().min(1).optional(),
});
export type CreateInterviewQuestionInput = z.output<typeof createInterviewQuestionInputSchema>;

export const updateInterviewQuestionInputSchema = z
  .object(questionFields)
  .partial()
  .refine((input) => Object.keys(input).length > 0, 'Nada para alterar');
export type UpdateInterviewQuestionInput = z.output<typeof updateInterviewQuestionInputSchema>;

export const practiceInputSchema = z.object({ rating: practiceRatingSchema });
export type PracticeInput = z.output<typeof practiceInputSchema>;

export const askedInputSchema = z.object({ note: longText(2_000) });
export type AskedInput = z.output<typeof askedInputSchema>;

/* --------------------------------------------------------------- saída */

export interface InterviewAskedDto {
  applicationId: string;
  jobTitle: string;
  company: string;
  askedAt: string;
  /** Como foi ("travei no exemplo", "gostaram da resposta"). */
  note: string | null;
}

export interface InterviewQuestionDto {
  id: string;
  question: string;
  category: InterviewCategory;
  tags: string[];
  answer: string | null;
  starSituation: string | null;
  starTask: string | null;
  starAction: string | null;
  starResult: string | null;
  /** Tem resposta (texto ou algum campo STAR). */
  answered: boolean;
  practice: {
    count: number;
    lastRating: PracticeRating | null;
    practicedAt: string | null;
  };
  /** Em quais candidaturas ela caiu, da mais recente para a mais antiga. */
  asked: InterviewAskedDto[];
  /** Veio da lista inicial (pode apagar à vontade). */
  seeded: boolean;
  createdAt: string;
  updatedAt: string;
}

export const STAR_FIELDS = [
  ['starSituation', 'Situação'],
  ['starTask', 'Tarefa'],
  ['starAction', 'Ação'],
  ['starResult', 'Resultado'],
] as const satisfies readonly [keyof InterviewQuestionDto, string][];

type Answerable = Pick<
  InterviewQuestionDto,
  'answer' | 'starSituation' | 'starTask' | 'starAction' | 'starResult'
>;

export const hasStar = (question: Answerable) =>
  STAR_FIELDS.some(([key]) => Boolean(question[key]?.trim()));

export const isAnswered = (question: Answerable) =>
  Boolean(question.answer?.trim()) || hasStar(question);

/* -------------------------------------------------------------- treino */

/**
 * Peso de cada pergunta no treino: "preciso treinar" aparece mais; nunca
 * treinada vem em seguida; "fui bem" aparece menos, e menos ainda se foi
 * treinada há pouco.
 */
export function practiceWeight(
  question: Pick<InterviewQuestionDto, 'practice'>,
  now: Date = new Date(),
): number {
  const { lastRating, practicedAt } = question.practice;
  if (lastRating === 'again') return 6;
  if (!practicedAt) return 4;
  const days = (now.getTime() - new Date(practicedAt).getTime()) / 86_400_000;
  return days >= 14 ? 2 : days >= 3 ? 1 : 0.5;
}

/**
 * Sorteia a próxima pergunta do treino, sem repetir as já vistas na sessão
 * (quando todas foram vistas, recomeça). `random` em [0, 1).
 */
export function pickPracticeQuestion<T extends Pick<InterviewQuestionDto, 'id' | 'practice'>>(
  pool: readonly T[],
  seen: ReadonlySet<string>,
  random = Math.random,
  now = new Date(),
): T | null {
  if (pool.length === 0) return null;
  const fresh = pool.filter((question) => !seen.has(question.id));
  const candidates = fresh.length > 0 ? fresh : pool;
  const weights = candidates.map((question) => practiceWeight(question, now));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let point = random() * total;
  for (const [index, weight] of weights.entries()) {
    point -= weight;
    if (point < 0) return candidates[index]!;
  }
  return candidates.at(-1)!;
}
