import { z } from 'zod';
import type { ApplicationStatus } from './applications';
import type { ScoreReason } from './preferences';
import { dateInputSchema, optionalText, pageQuerySchema, queryList } from './common';
import {
  contractTypeSchema,
  salaryPeriodSchema,
  seniorityLevelSchema,
  triageStatusSchema,
  workModelSchema,
  type ContractType,
  type SalaryPeriod,
  type SeniorityLevel,
  type TriageStatus,
  type WorkModel,
} from './enums';

/** Fonte gravada nas vagas cadastradas à mão. */
export const MANUAL_SOURCE = 'manual';

/**
 * Stack padronizada: minúsculas, sem espaço nas pontas, sem repetição,
 * mantendo a ordem. "TypeScript" e " typescript " viram a mesma coisa —
 * senão o filtro por stack falharia por diferença de digitação.
 */
export function normalizeStack(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const tech = value.trim().toLowerCase();
    if (tech && !seen.has(tech)) {
      seen.add(tech);
      result.push(tech);
    }
  }

  return result;
}

/* ------------------------------------------------------------- entrada */

/** URL opcional: string vazia (campo de formulário apagado) vale como `null`. */
const urlInput = z.preprocess(
  (value) => (value === '' ? null : value),
  z
    .url({ protocol: /^https?$/, message: 'Informe uma URL http(s) válida' })
    .max(2000)
    .nullable(),
);

const salaryValue = z.number().int().nonnegative().max(10_000_000);

/** Campos editáveis de uma vaga, sem defaults (servem para criar e editar). */
const jobFields = z.object({
  title: z.string().trim().min(1).max(200),
  company: z.string().trim().min(1).max(200),
  url: urlInput.optional(),
  description: optionalText(20_000),
  location: optionalText(200),
  notes: optionalText(5_000),
  workModel: workModelSchema.nullable().optional(),
  contractType: contractTypeSchema.nullable().optional(),
  seniority: seniorityLevelSchema.nullable().optional(),
  stack: z.array(z.string().max(40)).max(50).transform(normalizeStack),
  salaryMin: salaryValue.nullable().optional(),
  salaryMax: salaryValue.nullable().optional(),
  salaryCurrency: z.string().trim().toUpperCase().length(3).nullable().optional(),
  salaryPeriod: salaryPeriodSchema.nullable().optional(),
  postedAt: dateInputSchema.nullable().optional(),
});

function checkSalaryRange(
  value: { salaryMin?: number | null; salaryMax?: number | null },
  ctx: z.RefinementCtx,
): void {
  if (value.salaryMin != null && value.salaryMax != null && value.salaryMin > value.salaryMax) {
    ctx.addIssue({
      code: 'custom',
      path: ['salaryMax'],
      message: 'O salário máximo não pode ser menor que o mínimo',
    });
  }
}

export const createJobInputSchema = jobFields
  .extend({ stack: jobFields.shape.stack.default([]) })
  .superRefine(checkSalaryRange);
export type CreateJobInput = z.output<typeof createJobInputSchema>;

/** PATCH: tudo opcional; ausente = não mexe, `null` = limpa. */
export const updateJobInputSchema = jobFields.partial().superRefine(checkSalaryRange);
export type UpdateJobInput = z.output<typeof updateJobInputSchema>;

export const JOB_SORTS = ['score', 'recent'] as const;
export type JobSort = (typeof JOB_SORTS)[number];

export const jobListQuerySchema = pageQuerySchema.extend({
  q: z
    .string()
    .trim()
    .max(200)
    .transform((value) => value || undefined)
    .optional(),
  workModel: queryList(workModelSchema),
  contractType: queryList(contractTypeSchema),
  seniority: queryList(seniorityLevelSchema),
  source: queryList(z.string().min(1).max(50)),
  /** Fontes a esconder (ex.: os alertas por e-mail: `linkedin,indeed,glassdoor`). */
  excludeSource: queryList(z.string().min(1).max(50)),
  stack: queryList(
    z
      .string()
      .max(40)
      .transform((value) => value.toLowerCase()),
  ),
  postedWithinDays: z.coerce.number().int().min(1).max(365).optional(),
  /** Padrão: `inbox,saved` (descartadas só quando pedidas). */
  triage: queryList(triageStatusSchema),
  /**
   * Ordem. Ausente: pela nota quando há preferências, senão pela data de
   * entrada. Vaga sem nota vai para o fim.
   */
  sort: z.enum(JOB_SORTS).optional(),
  /** Só vagas com nota ≥ este valor (vagas sem nota ficam de fora). */
  minScore: z.coerce.number().int().min(0).max(1000).optional(),
  /** `true` esconde as incompatíveis (nota 0 por regra). */
  hideIncompatible: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  /**
   * `true` = só vagas com candidatura; `false` = só sem. Com `true` e sem
   * `triage`, o filtro padrão de triagem não se aplica.
   */
  hasApplication: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  /** `true` esconde as encerradas da caixa (saíram do board, a página diz, prazo venceu); salvas e com candidatura ficam. */
  hideClosed: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});
export type JobListQuery = z.output<typeof jobListQuerySchema>;

/** Triagem de uma vaga. `reason` só vale para `dismissed`. Desfazer = `inbox`. */
export const triageInputSchema = z.object({
  status: triageStatusSchema,
  reason: optionalText(200),
});
export type TriageInput = z.output<typeof triageInputSchema>;

export const MAX_BULK_TRIAGE = 200;

export const bulkTriageInputSchema = triageInputSchema.extend({
  ids: z.array(z.string().min(1)).min(1).max(MAX_BULK_TRIAGE),
});
export type BulkTriageInput = z.output<typeof bulkTriageInputSchema>;

/* --------------------------------------------------------------- saída */

export interface JobDto {
  id: string;
  source: string;
  externalId: string | null;
  url: string | null;
  title: string;
  company: string;
  description: string | null;
  location: string | null;
  notes: string | null;
  workModel: WorkModel | null;
  contractType: ContractType | null;
  seniority: SeniorityLevel | null;
  stack: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: SalaryPeriod | null;
  postedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  updatedAt: string;
  triage: TriageStatus;
  triagedAt: string | null;
  dismissReason: string | null;
  /** Resumo da candidatura, se houver — a lista mostra sem outra requisição. */
  application: { id: string; status: ApplicationStatus } | null;

  /* Nota de aderência — docs/features/07-preferences-score.md */
  /** 0–1000. `null` = sem preferências, nenhum critério com sinal, ou ainda não calculada. */
  score: number | null;
  /** Quanto dos critérios ligados a vaga informa (0–100). */
  scoreCoverage: number | null;
  scoreReasons: ScoreReason[];
  /** Bateu numa regra dura (empresa bloqueada, stack evitada no título...). Nota 0. */
  incompatible: boolean;
  /** A nota está na fila para ser calculada (vaga nova ou editada). */
  scorePending: boolean;

  /* Repostadas e duplicadas — docs/features/11-reposts.md */
  /** Já tinha aparecido antes com outro link. `null` = inédita. */
  repost: JobRepostDto | null;
  /** A mesma vaga em outros links (outras fontes). Não viram outra vaga. */
  alsoOn: { source: string; url: string }[];

  /* Ainda está aberta? — docs/features/13-availability.md */
  availability: JobAvailabilityDto;
}

export const AVAILABILITY_STATES = ['open', 'closed', 'unknown'] as const;
export type AvailabilityState = (typeof AVAILABILITY_STATES)[number];

export interface JobAvailabilityDto {
  /**
   * `closed` = sabemos que fechou (saiu do board, a página diz, prazo venceu).
   * `open` = a última conferência viu aberta. `null` = nada conferido ainda.
   */
  state: AvailabilityState | null;
  /** Por quê, em PT-BR. */
  reason: string | null;
  closedAt: string | null;
  /** Última conferência ativa. */
  checkedAt: string | null;
  /** Prazo de inscrição (Gupy). */
  deadline: string | null;
}

/** Janela em que uma vaga com a mesma impressão conta como "já apareceu". */
export const REPOST_WINDOW_DAYS = 180;
/**
 * A anterior foi vista há menos que isto: a nova é a MESMA vaga em outro
 * link (duplicada, vira `alsoOn`); senão, é uma repostagem (vaga nova ligada).
 */
export const DUPLICATE_LIVE_DAYS = 7;
/** Motivo gravado na repostagem que entra já descartada. */
export const MUTED_REPOST_REASON = 'Repostagem de vaga que você pediu para descartar sempre';

export interface JobRepostDto {
  /** Quantas vezes já tinha aparecido (nos últimos `REPOST_WINDOW_DAYS` dias). */
  count: number;
  /** Última vez que a anterior foi vista. */
  previousSeenAt: string | null;
  /** A anterior, se ainda existir no app (a limpeza pode ter apagado). */
  previous: {
    id: string;
    triage: TriageStatus;
    triagedAt: string | null;
    application: { id: string; status: ApplicationStatus } | null;
  } | null;
}

/** Uma vez em que a vaga apareceu (outra linha com a mesma impressão). */
export interface JobOccurrenceDto {
  /** `null` = a limpeza já apagou; só o link ficou lembrado. */
  jobId: string | null;
  source: string;
  url: string | null;
  /** Quando entrou no app (`null` nas apagadas). */
  firstSeenAt: string | null;
  /** Última vez vista; nas apagadas, quando a limpeza apagou. */
  lastSeenAt: string;
  /** `forgotten` = descartada e apagada pela limpeza. */
  triage: TriageStatus | 'forgotten';
  triagedAt: string | null;
  application: { id: string; status: ApplicationStatus; appliedAt: string } | null;
}

export interface JobHistoryDto {
  /** Repostagens desta vaga entram já descartadas. */
  repostsMuted: boolean;
  /** As outras vezes, da mais recente para a mais antiga (sem a própria vaga). */
  occurrences: JobOccurrenceDto[];
}

export const muteRepostsInputSchema = z.object({ muted: z.boolean() });
export type MuteRepostsInput = z.output<typeof muteRepostsInputSchema>;

/** Resultado de `JobsService.ingest` — usado pelas fontes. */
export interface IngestResult {
  received: number;
  created: number;
  /** Vagas que já existiam e tiveram o `lastSeenAt` atualizado. */
  seen: number;
  /** Vagas descartadas e já apagadas pela retenção: a fonte trouxe, foram ignoradas. */
  ignored: number;
  /** Links novos de uma vaga que já existe (outra fonte): viraram `alsoOn`. */
  duplicates: number;
  /** Das criadas, quantas já tinham aparecido antes com outro link. */
  reposts: number;
}

export interface BulkTriageResult {
  updated: number;
  /** Ids não alterados: inexistentes ou com candidatura (não podem ser descartados). */
  skipped: string[];
}

/* ------------------------------------------------------- faixas da nota */

/** Limites das faixas da nota. Front (cor do selo) e `/jobs/counts` usam os mesmos. */
export const SCORE_TIER_MIN = { great: 800, good: 600 } as const;

export const SCORE_TIERS = [
  'great',
  'good',
  'weak',
  'incompatible',
  'pending',
  'unscored',
] as const;
export type ScoreTier = (typeof SCORE_TIERS)[number];

/**
 * Faixa de uma vaga. A ordem importa: nota na fila vem antes de tudo (a nota
 * antiga pode estar desatualizada), depois incompatível, depois sem nota.
 */
export function scoreTier(job: Pick<JobDto, 'score' | 'incompatible' | 'scorePending'>): ScoreTier {
  if (job.scorePending) return 'pending';
  if (job.incompatible) return 'incompatible';
  if (job.score === null) return 'unscored';
  if (job.score >= SCORE_TIER_MIN.great) return 'great';
  if (job.score >= SCORE_TIER_MIN.good) return 'good';
  return 'weak';
}

/** `GET /api/jobs/counts` — números do menu e da prévia das preferências. */
export interface JobCountsDto {
  triage: Record<TriageStatus, number>;
  /** Vagas com candidatura (qualquer status). */
  withApplication: number;
  /** Faixas da nota, só caixa + salvas (o que ainda aparece na lista). */
  score: Record<ScoreTier, number>;
  /** Caixa de entrada sem as incompatíveis e sem as encerradas — o número do Deslizar. */
  swipeable: number;
  /** Encerradas na caixa (escondidas por padrão) — docs/features/13-availability.md. */
  inboxClosed: number;
}
