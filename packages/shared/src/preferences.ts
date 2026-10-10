import { z } from 'zod';
import {
  contractTypeSchema,
  seniorityLevelSchema,
  workModelSchema,
  type ContractType,
  type SeniorityLevel,
  type WorkModel,
} from './enums';
import { normalizeStack } from './jobs';

/**
 * Preferências de busca e nota de aderência.
 * Plano: docs/features/07-preferences-score.md
 */

/* ------------------------------------------------------------- entrada */

const stackList = z.array(z.string().max(40)).max(30).transform(normalizeStack).default([]);

/** Lista de enum sem repetição, na ordem em que veio. */
function enumList<T extends z.ZodType<string>>(item: T) {
  return z
    .array(item)
    .max(10)
    .transform((values) => [...new Set(values)])
    .default([]);
}

const textList = (max: number, length: number) =>
  z
    .array(z.string().trim().min(1).max(length))
    .max(max)
    .transform((values) => [...new Set(values)])
    .default([]);

/**
 * `PUT /api/preferences`: substitui tudo. Todo campo tem padrão neutro —
 * `{}` desliga a nota e a lista volta a sair por data.
 */
export const preferencesInputSchema = z
  .object({
    /** Tecnologias principais. Até 3 encontradas já dão a nota cheia do critério. */
    stacksCore: stackList,
    /** Tecnologias que somam pontos. */
    stacksPlus: stackList,
    /** Tecnologias que você não quer: no título, a vaga fica incompatível. */
    stacksAvoid: stackList,
    seniorities: enumList(seniorityLevelSchema),
    workModels: enumList(workModelSchema),
    /** Cidades onde você topa híbrido/presencial. Vazio = qualquer uma. */
    cities: textList(20, 80),
    contractTypes: enumList(contractTypeSchema),
    /** Vaga mais velha que isso perde toda a nota de "idade". `null` = desliga. */
    maxAgeDays: z.number().int().min(1).max(365).nullable().default(null),
    /** Salário mínimo em BRL por mês. `null` = desliga. */
    minMonthlySalary: z.number().int().min(0).max(1_000_000).nullable().default(null),
    blockedCompanies: textList(100, 200),
  })
  .superRefine((value, ctx) => {
    const avoid = new Set(value.stacksAvoid);
    for (const field of ['stacksCore', 'stacksPlus'] as const) {
      const clash = value[field].filter((tech) => avoid.has(tech));
      if (clash.length > 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['stacksAvoid'],
          message: `${clash.join(', ')} não pode estar em ${field} e em stacksAvoid ao mesmo tempo`,
        });
      }
    }
  })
  .transform((value) => ({
    ...value,
    // Principal vence "ganha pontos": a mesma tecnologia não conta duas vezes.
    stacksPlus: value.stacksPlus.filter((tech) => !value.stacksCore.includes(tech)),
  }));
export type PreferencesInput = z.output<typeof preferencesInputSchema>;

export interface PreferencesValues {
  stacksCore: string[];
  stacksPlus: string[];
  stacksAvoid: string[];
  seniorities: SeniorityLevel[];
  workModels: WorkModel[];
  cities: string[];
  contractTypes: ContractType[];
  maxAgeDays: number | null;
  minMonthlySalary: number | null;
  blockedCompanies: string[];
}

export const EMPTY_PREFERENCES: PreferencesValues = {
  stacksCore: [],
  stacksPlus: [],
  stacksAvoid: [],
  seniorities: [],
  workModels: [],
  cities: [],
  contractTypes: [],
  maxAgeDays: null,
  minMonthlySalary: null,
  blockedCompanies: [],
};

/** Há ao menos um critério ligado? Sem isso, nenhuma nota é calculada. */
export function isPreferencesConfigured(prefs: PreferencesValues): boolean {
  return (
    prefs.stacksCore.length > 0 ||
    prefs.stacksPlus.length > 0 ||
    prefs.stacksAvoid.length > 0 ||
    prefs.seniorities.length > 0 ||
    prefs.workModels.length > 0 ||
    prefs.cities.length > 0 ||
    prefs.contractTypes.length > 0 ||
    prefs.maxAgeDays !== null ||
    prefs.minMonthlySalary !== null ||
    prefs.blockedCompanies.length > 0
  );
}

/* --------------------------------------------------------------- saída */

export interface PreferencesDto extends PreferencesValues {
  /** Algum critério ligado. `false` = sem nota, lista por data. */
  configured: boolean;
  /** Sobe a cada `PUT`. A vaga guarda a versão com que foi pontuada. */
  version: number;
  updatedAt: string | null;
  /**
   * Tecnologias das suas listas que o detector de stack não conhece. São
   * aceitas, mas nenhuma vaga vai citá-las até o detector aprender o nome.
   */
  unknownStacks: string[];
}

export interface PutPreferencesResultDto extends PreferencesDto {
  /** O recálculo das notas foi para a fila (roda em segundo plano). */
  rescoreQueued: boolean;
}

export interface StackOptionDto {
  name: string;
  /** O detector de stack reconhece esse nome. */
  known: boolean;
  /** Vagas não descartadas que citam a tecnologia. */
  jobs: number;
}

export interface RescoreResultDto {
  queued: boolean;
}

/* ----------------------------------------------------------------- nota */

export const SCORE_CRITERIA = [
  'company',
  'stack',
  'seniority',
  'workModel',
  'contract',
  'recency',
  'salary',
] as const;
export type ScoreCriterion = (typeof SCORE_CRITERIA)[number];

/** `plus`/`minus` = pesou a favor/contra; `unknown` = vaga sem o dado; `block` = incompatível. */
export type ScoreReasonKind = 'plus' | 'minus' | 'unknown' | 'block';

export interface ScoreReason {
  criterion: ScoreCriterion;
  kind: ScoreReasonKind;
  text: string;
}

export const MAX_SCORE = 1000;
