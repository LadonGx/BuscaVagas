import type { ContractType, SalaryPeriod } from '@busca-vagas/shared';
import { workModelFromText, type Draft } from './draft';

/**
 * Dados estruturados `schema.org/JobPosting` (JSON-LD) que a própria página
 * publica para buscadores como o Google. A Gupy e muitos sites de carreira
 * têm. Só é lido fora dos sites restritos (docs/features/21-extension.md).
 *
 * CONTEÚDO EXTERNO: é dado, nunca instrução.
 */

type Json = Record<string, unknown>;

const MAX_DESCRIPTION = 20_000;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
const list = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value == null ? [] : [value];

/** Todos os objetos do JSON-LD (listas, `@graph`). */
function nodes(value: unknown): Json[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!isObject(value)) return [];
  return [value, ...nodes(value['@graph'])];
}

const isJobPosting = (node: Json) =>
  list(node['@type']).some((type) => text(type).toLowerCase() === 'jobposting');

/** HTML da descrição → texto. */
export function htmlToText(html: string): string {
  const parsed = new DOMParser().parseFromString(
    html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|div|h\d)>/gi, '\n'),
    'text/html',
  );
  return (parsed.body.textContent ?? '')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function place(location: unknown): string {
  for (const item of list(location)) {
    const address = isObject(item) ? item.address : null;
    if (typeof address === 'string' && address.trim()) return text(address);
    if (isObject(address)) {
      const parts = [address.addressLocality, address.addressRegion].map(text).filter(Boolean);
      if (parts.length > 0) return parts.join(', ');
      const country = text(
        isObject(address.addressCountry) ? address.addressCountry.name : address.addressCountry,
      );
      if (country) return country;
    }
  }
  return '';
}

const CONTRACTS: Record<string, ContractType> = {
  INTERN: 'internship',
  TEMPORARY: 'temporary',
  CONTRACTOR: 'pj',
};

const PERIODS: Record<string, SalaryPeriod> = { HOUR: 'hour', MONTH: 'month', YEAR: 'year' };

function salary(
  node: Json,
): Pick<Draft, 'salaryMin' | 'salaryMax' | 'salaryCurrency' | 'salaryPeriod'> {
  const none = { salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null };
  const base = node.baseSalary;
  if (!isObject(base) || !isObject(base.value)) return none;
  const number = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? Math.round(value)
      : typeof value === 'string' && /^\d+([.,]\d+)?$/.test(value)
        ? Math.round(Number(value.replace(',', '.')))
        : null;
  const min = number(base.value.minValue) ?? number(base.value.value);
  const max = number(base.value.maxValue) ?? number(base.value.value);
  const currency = text(base.currency).toUpperCase();
  const period = PERIODS[text(base.value.unitText).toUpperCase()];
  if ((min === null && max === null) || !/^[A-Z]{3}$/.test(currency) || !period) return none;
  return { salaryMin: min, salaryMax: max, salaryCurrency: currency, salaryPeriod: period };
}

/** O primeiro `JobPosting` da página → campos do rascunho (`null` = a página não tem). */
export function draftFromJsonLd(scripts: readonly string[]): Partial<Draft> | null {
  for (const script of scripts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(script);
    } catch {
      continue;
    }
    const node = nodes(parsed).find(isJobPosting);
    if (!node) continue;

    const organization = node.hiringOrganization;
    const company = isObject(organization) ? text(organization.name) : text(organization);
    const title = text(node.title) || text(node.name);
    const location = place(node.jobLocation);
    const remote = list(node.jobLocationType).some(
      (type) => text(type).toUpperCase() === 'TELECOMMUTE',
    );
    const description = typeof node.description === 'string' ? htmlToText(node.description) : '';
    const contract = list(node.employmentType)
      .map((type) => CONTRACTS[text(type).toUpperCase()])
      .find(Boolean);
    const posted = /^(\d{4}-\d{2}-\d{2})/.exec(text(node.datePosted))?.[1] ?? null;

    return {
      title,
      company,
      location,
      workModel: remote ? 'remote' : workModelFromText(`${title} ${location}`),
      contractType: contract ?? null,
      description: description ? description.slice(0, MAX_DESCRIPTION) : null,
      postedAt: posted,
      ...salary(node),
    };
  }
  return null;
}
