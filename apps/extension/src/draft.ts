import type { ContractType, CreateJobInput, SalaryPeriod, WorkModel } from '@busca-vagas/shared';

/** O rascunho da vaga que a janelinha mostra para você conferir. */
export interface Draft {
  url: string;
  title: string;
  company: string;
  location: string;
  workModel: WorkModel | null;
  /** Só dos sites que publicam JSON-LD: não aparecem no formulário, mas vão junto. */
  contractType: ContractType | null;
  description: string | null;
  /** AAAA-MM-DD */
  postedAt: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: SalaryPeriod | null;
}

export const emptyDraft = (url: string): Draft => ({
  url,
  title: '',
  company: '',
  location: '',
  workModel: null,
  contractType: null,
  description: null,
  postedAt: null,
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
  salaryPeriod: null,
});

/** "Remoto", "Híbrido", "Presencial" no texto (título ou local). */
export function workModelFromText(text: string): WorkModel | null {
  const value = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (/\b(hibrido|hibrida|hybrid)\b/.test(value)) return 'hybrid';
  if (/\b(remoto|remota|remote|home office|teletrabalho)\b/.test(value)) return 'remote';
  if (/\b(presencial|on-?site)\b/.test(value)) return 'onsite';
  return null;
}

/** Rascunho → corpo do `POST /api/jobs`. */
export function toCreateInput(draft: Draft, triage: 'inbox' | 'saved'): CreateJobInput {
  const hasSalary = draft.salaryMin !== null || draft.salaryMax !== null;
  return {
    title: draft.title.trim(),
    company: draft.company.trim(),
    url: draft.url,
    location: draft.location.trim() || null,
    workModel: draft.workModel,
    contractType: draft.contractType,
    description: draft.description,
    postedAt: draft.postedAt ? new Date(draft.postedAt) : null,
    stack: [],
    ...(hasSalary && {
      salaryMin: draft.salaryMin,
      salaryMax: draft.salaryMax,
      salaryCurrency: draft.salaryCurrency,
      salaryPeriod: draft.salaryPeriod,
    }),
    triage,
  };
}
