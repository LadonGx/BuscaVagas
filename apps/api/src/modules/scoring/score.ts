import {
  isPreferencesConfigured,
  MAX_SCORE,
  SENIORITY_LEVELS,
  type ContractType,
  type PreferencesValues,
  type SalaryPeriod,
  type ScoreCriterion,
  type ScoreReason,
  type SeniorityLevel,
  type WorkModel,
} from '@busca-vagas/shared';
import { fold, stackFromText } from '@busca-vagas/sources';

/**
 * Nota de aderência (0–1000), calculada por código. FUNÇÃO PURA: sem banco,
 * sem Nest, sem relógio implícito — tudo entra pelos parâmetros.
 *
 * Plano e tabela de pesos: docs/features/07-preferences-score.md
 */

/** Pesos fixos. Critério sem sinal sai da conta (não vale zero). */
export const SCORE_WEIGHTS = {
  stack: 35,
  seniority: 25,
  workModel: 20,
  contract: 10,
  recency: 10,
  salary: 10,
} as const satisfies Partial<Record<ScoreCriterion, number>>;

type WeightedCriterion = keyof typeof SCORE_WEIGHTS;

/** O que a nota lê de uma vaga. */
export interface ScorableJob {
  title: string;
  company: string;
  location: string | null;
  workModel: WorkModel | null;
  contractType: ContractType | null;
  seniority: SeniorityLevel | null;
  stack: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: SalaryPeriod | null;
  postedAt: Date | null;
  firstSeenAt: Date;
}

export interface ScoreResult {
  /** `null` = sem preferências ou nenhum critério com sinal. */
  score: number | null;
  /** % do peso dos critérios ligados que a vaga informa. */
  coverage: number | null;
  reasons: ScoreReason[];
  incompatible: boolean;
}

/** Valor de um critério: 0–1, ou `null` quando a vaga não tem o dado. */
interface CriterionResult {
  value: number | null;
  reason: ScoreReason | null;
  /** Regra dura: a vaga fica incompatível. */
  block?: ScoreReason;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Até esta idade a vaga é "nova" e leva a nota cheia do critério. */
const FRESH_DAYS = 7;
/** Horas por mês, para comparar salário por hora (22 dias × 8 h). */
const HOURS_PER_MONTH = 176;

export const SENIORITY_LABELS: Record<SeniorityLevel, string> = {
  intern: 'Estágio',
  trainee: 'Trainee',
  junior: 'Júnior',
  mid: 'Pleno',
  senior: 'Sênior',
  lead: 'Liderança',
};

export const WORK_MODEL_LABELS: Record<WorkModel, string> = {
  remote: 'Remota',
  hybrid: 'Híbrida',
  onsite: 'Presencial',
};

export const CONTRACT_LABELS: Record<ContractType, string> = {
  clt: 'CLT',
  pj: 'PJ',
  internship: 'Estágio',
  temporary: 'Temporário',
  other: 'Outro contrato',
};

export function scoreJob(job: ScorableJob, prefs: PreferencesValues, now: Date): ScoreResult {
  if (!isPreferencesConfigured(prefs)) {
    return { score: null, coverage: null, reasons: [], incompatible: false };
  }

  const blocks: ScoreReason[] = [];
  const company = companyBlock(job, prefs);
  if (company) blocks.push(company);

  const criteria: Record<WeightedCriterion, CriterionResult | null> = {
    stack: stackCriterion(job, prefs),
    seniority: seniorityCriterion(job, prefs),
    workModel: workModelCriterion(job, prefs),
    contract: contractCriterion(job, prefs),
    recency: recencyCriterion(job, prefs, now),
    salary: salaryCriterion(job, prefs),
  };

  let configuredWeight = 0;
  let availableWeight = 0;
  let points = 0;
  const reasons: ScoreReason[] = [];

  for (const key of Object.keys(SCORE_WEIGHTS) as WeightedCriterion[]) {
    const result = criteria[key];
    if (!result) continue; // critério desligado nas preferências

    configuredWeight += SCORE_WEIGHTS[key];
    if (result.block) blocks.push(result.block);
    if (result.reason) reasons.push(result.reason);
    if (result.value !== null) {
      availableWeight += SCORE_WEIGHTS[key];
      points += SCORE_WEIGHTS[key] * result.value;
    }
  }

  const coverage =
    configuredWeight > 0 ? Math.round((100 * availableWeight) / configuredWeight) : null;
  const incompatible = blocks.length > 0;

  let score: number | null = null;
  if (incompatible) {
    score = 0;
  } else if (availableWeight > 0) {
    score = Math.round((MAX_SCORE * points) / availableWeight);
  }

  return { score, coverage, reasons: [...blocks, ...reasons], incompatible };
}

/* ------------------------------------------------------------ critérios */

function companyBlock(job: ScorableJob, prefs: PreferencesValues): ScoreReason | null {
  const company = fold(job.company);
  const blocked = prefs.blockedCompanies.find((name) => {
    const target = fold(name);
    return target !== '' && company.includes(target);
  });
  return blocked
    ? { criterion: 'company', kind: 'block', text: `Empresa bloqueada: ${job.company}` }
    : null;
}

function stackCriterion(job: ScorableJob, prefs: PreferencesValues): CriterionResult | null {
  const { stacksCore: core, stacksPlus: plus, stacksAvoid: avoid } = prefs;
  const configured = core.length > 0 || plus.length > 0;
  if (!configured && avoid.length === 0) return null;

  // Stack evitada no título = é o foco da vaga: incompatível.
  const titleStack = new Set(stackFromText(job.title));
  const paddedTitle = ` ${fold(job.title).replace(/[^a-z0-9#+.]+/g, ' ')} `;
  const avoidInTitle = avoid.filter(
    (tech) => titleStack.has(tech) || paddedTitle.includes(` ${fold(tech)} `),
  );
  const block: ScoreReason | undefined = avoidInTitle.length
    ? {
        criterion: 'stack',
        kind: 'block',
        text: `Stack evitada no título: ${avoidInTitle.join(', ')}`,
      }
    : undefined;

  const stack = new Set(job.stack);
  const avoidInText = avoid.filter((tech) => stack.has(tech) && !avoidInTitle.includes(tech));

  if (!configured) {
    // Só "evitar" ligado: não pontua, mas avisa.
    return {
      value: null,
      reason: avoidInText.length
        ? {
            criterion: 'stack',
            kind: 'minus',
            text: `Cita stack evitada: ${avoidInText.join(', ')}`,
          }
        : null,
      block,
    };
  }

  if (stack.size === 0) {
    return {
      value: null,
      reason: { criterion: 'stack', kind: 'unknown', text: 'Stack não identificada na vaga' },
      block,
    };
  }

  const coreHits = core.filter((tech) => stack.has(tech));
  const plusHits = plus.filter((tech) => stack.has(tech));
  const corePart = core.length ? Math.min(1, coreHits.length / Math.min(3, core.length)) : null;
  const plusPart = plus.length ? Math.min(1, plusHits.length / Math.min(2, plus.length)) : null;

  let value =
    corePart !== null && plusPart !== null
      ? 0.8 * corePart + 0.2 * plusPart
      : (corePart ?? plusPart ?? 0);
  if (avoidInText.length) value *= 0.5;

  const parts: string[] = [];
  if (core.length) {
    parts.push(
      coreHits.length
        ? `${coreHits.join(', ')} (${coreHits.length} de ${core.length} principais)`
        : 'nenhuma das suas stacks principais',
    );
  }
  if (plusHits.length) parts.push(`+ ${plusHits.join(', ')}`);
  if (avoidInText.length) parts.push(`cita stack evitada: ${avoidInText.join(', ')}`);

  return {
    value,
    reason: {
      criterion: 'stack',
      kind: value >= 0.5 ? 'plus' : 'minus',
      text: capitalize(parts.join(' · ')),
    },
    block,
  };
}

function seniorityCriterion(job: ScorableJob, prefs: PreferencesValues): CriterionResult | null {
  if (prefs.seniorities.length === 0) return null;

  if (!job.seniority) {
    return {
      value: null,
      reason: { criterion: 'seniority', kind: 'unknown', text: 'Senioridade não informada' },
    };
  }

  const index = SENIORITY_LEVELS.indexOf(job.seniority);
  const distance = Math.min(
    ...prefs.seniorities.map((level) => Math.abs(SENIORITY_LEVELS.indexOf(level) - index)),
  );
  const value = distance === 0 ? 1 : distance === 1 ? 0.5 : 0;
  const label = SENIORITY_LABELS[job.seniority];
  const wanted = prefs.seniorities.map((level) => SENIORITY_LABELS[level].toLowerCase()).join(', ');

  return {
    value,
    reason:
      value === 1
        ? { criterion: 'seniority', kind: 'plus', text: label }
        : { criterion: 'seniority', kind: 'minus', text: `${label} (você busca ${wanted})` },
  };
}

function workModelCriterion(job: ScorableJob, prefs: PreferencesValues): CriterionResult | null {
  if (prefs.workModels.length === 0 && prefs.cities.length === 0) return null;

  if (!job.workModel) {
    return {
      value: null,
      reason: { criterion: 'workModel', kind: 'unknown', text: 'Modalidade não informada' },
    };
  }

  const label = WORK_MODEL_LABELS[job.workModel];
  const accepted = prefs.workModels.length === 0 || prefs.workModels.includes(job.workModel);

  if (!accepted) {
    const wanted = prefs.workModels
      .map((model) => WORK_MODEL_LABELS[model].toLowerCase())
      .join(', ');
    const block: ScoreReason = {
      criterion: 'workModel',
      kind: 'block',
      text: `${label} (você aceita: ${wanted})`,
    };
    return { value: 0, reason: null, block };
  }

  if (job.workModel === 'remote' || prefs.cities.length === 0) {
    return {
      value: 1,
      reason: { criterion: 'workModel', kind: 'plus', text: withPlace(label, job) },
    };
  }

  // Híbrida/presencial com cidades configuradas: o local decide.
  if (!job.location) {
    return {
      value: 0.5,
      reason: { criterion: 'workModel', kind: 'unknown', text: `${label}, cidade não informada` },
    };
  }

  const place = fold(job.location);
  const city = prefs.cities.find((name) => place.includes(fold(name)));
  if (city) {
    return {
      value: 1,
      reason: { criterion: 'workModel', kind: 'plus', text: `${label} em ${job.location}` },
    };
  }

  return {
    value: 0,
    reason: null,
    block: {
      criterion: 'workModel',
      kind: 'block',
      text: `${label} em ${job.location} (fora das suas cidades)`,
    },
  };
}

function contractCriterion(job: ScorableJob, prefs: PreferencesValues): CriterionResult | null {
  if (prefs.contractTypes.length === 0) return null;

  if (!job.contractType) {
    return {
      value: null,
      reason: { criterion: 'contract', kind: 'unknown', text: 'Contrato não informado' },
    };
  }

  const label = CONTRACT_LABELS[job.contractType];
  return prefs.contractTypes.includes(job.contractType)
    ? { value: 1, reason: { criterion: 'contract', kind: 'plus', text: label } }
    : {
        value: 0,
        reason: {
          criterion: 'contract',
          kind: 'minus',
          text: `${label} (você aceita ${prefs.contractTypes.map((c) => CONTRACT_LABELS[c]).join(', ')})`,
        },
      };
}

function recencyCriterion(
  job: ScorableJob,
  prefs: PreferencesValues,
  now: Date,
): CriterionResult | null {
  if (prefs.maxAgeDays === null) return null;

  // Sem data de publicação, vale a data em que a vaga entrou no app.
  const since = job.postedAt ?? job.firstSeenAt;
  const days = Math.max(0, Math.floor((now.getTime() - since.getTime()) / DAY_MS));
  const max = prefs.maxAgeDays;

  let value: number;
  if (days <= Math.min(FRESH_DAYS, max)) value = 1;
  else if (days >= max) value = 0;
  else value = 1 - (days - FRESH_DAYS) / (max - FRESH_DAYS);

  const text = days === 0 ? 'Publicada hoje' : `Publicada há ${days} dia${days === 1 ? '' : 's'}`;
  const suffix = job.postedAt ? '' : ' (entrada no app)';
  return {
    value,
    reason: { criterion: 'recency', kind: value >= 0.5 ? 'plus' : 'minus', text: text + suffix },
  };
}

function salaryCriterion(job: ScorableJob, prefs: PreferencesValues): CriterionResult | null {
  if (prefs.minMonthlySalary === null) return null;

  const top = job.salaryMax ?? job.salaryMin;
  if (top === null || !job.salaryPeriod) {
    return {
      value: null,
      reason: { criterion: 'salary', kind: 'unknown', text: 'Salário não informado' },
    };
  }

  if ((job.salaryCurrency ?? 'BRL') !== 'BRL') {
    return {
      value: null,
      reason: {
        criterion: 'salary',
        kind: 'unknown',
        text: `Salário em ${job.salaryCurrency} — sem comparação`,
      },
    };
  }

  const monthly =
    job.salaryPeriod === 'month'
      ? top
      : job.salaryPeriod === 'year'
        ? top / 12
        : top * HOURS_PER_MONTH;
  const min = prefs.minMonthlySalary;
  const value = min === 0 || monthly >= min ? 1 : monthly / min;
  const text = `Até ${formatBrl(monthly)}/mês`;

  return {
    value,
    reason:
      value === 1
        ? { criterion: 'salary', kind: 'plus', text }
        : { criterion: 'salary', kind: 'minus', text: `${text} (seu mínimo: ${formatBrl(min)})` },
  };
}

/* -------------------------------------------------------------- helpers */

function withPlace(label: string, job: ScorableJob): string {
  return job.location ? `${label} · ${job.location}` : label;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatBrl(value: number): string {
  return `R$ ${Math.round(value).toLocaleString('pt-BR')}`;
}
