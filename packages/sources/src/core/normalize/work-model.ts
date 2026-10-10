import type { ContractType, WorkModel } from '@busca-vagas/shared';
import { fold } from './text';

/**
 * Modalidade e contrato a partir de texto livre ("Remote - Brazil",
 * "Full-time", "Estágio"). Para APIs que não têm um campo próprio.
 * Sem pista → `null`.
 */
export function workModelFromText(text: string | null | undefined): WorkModel | null {
  const value = fold(text ?? '').replace(/[-_/]+/g, ' ');
  if (/\b(hybrid|hibrido|hibrida)\b/.test(value)) return 'hybrid';
  if (/\b(remote|remoto|remota|anywhere|home office|teletrabalho)\b/.test(value)) return 'remote';
  if (/\b(on site|onsite|presencial|in office)\b/.test(value)) return 'onsite';
  return null;
}

/**
 * Jornada não é regime: "Full-time" de empresa estrangeira pode ser CLT, PJ
 * ou contractor — por isso vira `null`, não `clt`.
 */
export function contractFromText(text: string | null | undefined): ContractType | null {
  const value = fold(text ?? '').replace(/[-_/]+/g, ' ');
  if (/\b(intern|internship|estagio|estagiari[oa])\b/.test(value)) return 'internship';
  if (/\b(temporary|temporario|temporaria|temp)\b/.test(value)) return 'temporary';
  if (/\b(clt|efetivo)\b/.test(value)) return 'clt';
  if (/\b(pj|pessoa juridica)\b/.test(value)) return 'pj';
  if (/\b(contract|contractor|freelance|freelancer)\b/.test(value)) return 'other';
  return null;
}
