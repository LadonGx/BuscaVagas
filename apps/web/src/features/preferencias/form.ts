import {
  preferencesInputSchema,
  type PreferencesDto,
  type PreferencesValues,
} from '@busca-vagas/shared';
import type { ValidationIssue } from '../../api/client';

/**
 * O formulário guarda os números como texto (o campo pode estar vazio ou no
 * meio da digitação); o resto é igual ao que a API recebe.
 */
export type PreferencesForm = Omit<PreferencesValues, 'maxAgeDays' | 'minMonthlySalary'> & {
  maxAgeDays: string;
  minMonthlySalary: string;
};

export type FormField = keyof PreferencesForm;
export type FormErrors = Partial<Record<FormField, string>>;

export const FORM_FIELDS: readonly FormField[] = [
  'stacksCore',
  'stacksPlus',
  'stacksAvoid',
  'seniorities',
  'workModels',
  'cities',
  'contractTypes',
  'maxAgeDays',
  'minMonthlySalary',
  'blockedCompanies',
];

/** As três listas de tecnologias, na ordem da tela. */
export const STACK_FIELDS = ['stacksCore', 'stacksPlus', 'stacksAvoid'] as const;
export type StackField = (typeof STACK_FIELDS)[number];

export function toForm(saved: PreferencesValues): PreferencesForm {
  return {
    stacksCore: saved.stacksCore,
    stacksPlus: saved.stacksPlus,
    stacksAvoid: saved.stacksAvoid,
    seniorities: saved.seniorities,
    workModels: saved.workModels,
    cities: saved.cities,
    contractTypes: saved.contractTypes,
    maxAgeDays: saved.maxAgeDays === null ? '' : String(saved.maxAgeDays),
    minMonthlySalary: saved.minMonthlySalary === null ? '' : String(saved.minMonthlySalary),
    blockedCompanies: saved.blockedCompanies,
  };
}

/** Quais campos mudaram em relação ao salvo. */
export function changedFields(form: PreferencesForm, saved: PreferencesDto): FormField[] {
  const base = toForm(saved);
  return FORM_FIELDS.filter((field) => {
    const a = form[field];
    const b = base[field];
    return typeof a === 'string' ? a.trim() !== b : JSON.stringify(a) !== JSON.stringify(b);
  });
}

const RANGE_MESSAGE: Partial<Record<FormField, string>> = {
  maxAgeDays: 'Use de 1 a 365 dias, ou deixe vazio para desligar.',
  minMonthlySalary: 'Use de R$ 0 a R$ 1.000.000, ou deixe vazio para desligar.',
};

/** Texto do campo → número inteiro, `null` (vazio) ou `NaN` (inválido). */
function toNumber(text: string): number | null {
  const value = text.trim();
  if (!value) return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : Number.NaN;
}

function messageFor(field: FormField, code: string, maximum?: unknown, message?: string): string {
  if (RANGE_MESSAGE[field]) return RANGE_MESSAGE[field];
  if (code === 'too_big' && maximum !== undefined) return `Até ${String(maximum)} itens.`;
  if (field === 'stacksAvoid' && code === 'custom') {
    return 'A mesma tecnologia não pode estar em "Evitar" e em outro grupo.';
  }
  return message ?? 'Valor inválido.';
}

/** Valida com o schema do `shared`. Sem erros, devolve o corpo do `PUT`. */
export function validateForm(
  form: PreferencesForm,
): { values: PreferencesValues; errors: null } | { values: null; errors: FormErrors } {
  const errors: FormErrors = {};
  const maxAgeDays = toNumber(form.maxAgeDays);
  const minMonthlySalary = toNumber(form.minMonthlySalary);
  if (Number.isNaN(maxAgeDays)) errors.maxAgeDays = RANGE_MESSAGE.maxAgeDays;
  if (Number.isNaN(minMonthlySalary)) errors.minMonthlySalary = RANGE_MESSAGE.minMonthlySalary;

  const result = preferencesInputSchema.safeParse({ ...form, maxAgeDays, minMonthlySalary });
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0] as FormField | undefined;
      if (!field || errors[field]) continue;
      errors[field] = messageFor(
        field,
        issue.code,
        'maximum' in issue ? issue.maximum : undefined,
        issue.message,
      );
    }
  }

  if (Object.keys(errors).length > 0) return { values: null, errors };
  return { values: result.data!, errors: null };
}

/** Erros que a API devolveu (`issues` com `path`), no mesmo formato. */
export function errorsFromApi(issues: readonly ValidationIssue[]): FormErrors {
  const errors: FormErrors = {};
  for (const issue of issues) {
    const field = String(issue.path).split('.')[0] as FormField;
    if (FORM_FIELDS.includes(field) && !errors[field]) {
      errors[field] = RANGE_MESSAGE[field] ?? issue.message;
    }
  }
  return errors;
}

/**
 * Põe a tecnologia num grupo e tira dos outros (a API recusa a mesma
 * tecnologia em "Evitar" e noutro grupo). Devolve o grupo de onde saiu.
 */
export function moveStack(
  form: PreferencesForm,
  tech: string,
  to: StackField,
): { form: PreferencesForm; from: StackField | null } {
  let from: StackField | null = null;
  const next = { ...form };
  for (const field of STACK_FIELDS) {
    if (field === to) continue;
    if (next[field].includes(tech)) {
      from = field;
      next[field] = next[field].filter((item) => item !== tech);
    }
  }
  if (!next[to].includes(tech)) next[to] = [...next[to], tech];
  return { form: next, from };
}
