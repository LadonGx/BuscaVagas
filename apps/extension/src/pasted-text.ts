import type { ContractType, SalaryPeriod } from '@busca-vagas/shared';
import { workModelFromText, type Draft } from './draft';

/**
 * O texto que você copia da página da vaga e cola na janelinha. Nos sites
 * restritos a extensão não lê a página: é você quem seleciona e copia, e
 * daqui sai o que o título da aba não traz. Formato do LinkedIn:
 *
 *   Vericode
 *   Desenvolvedor(a) Full Stack Júnior – Node.js | React Native
 *   Brasil · há 1 mês · Mais de 100 pessoas clicaram em Candidate-se
 *   Respostas gerenciadas fora do LinkedIn
 *   Remoto
 *   Tempo integral
 *   Candidatar-se
 *   ...
 *   Sobre a vaga
 *   <descrição>
 *
 * Funciona também com a página inteira (Ctrl+A): a linha "local · data" mais
 * perto de "Sobre a vaga" é a da vaga aberta.
 */
export type PastedFields = Partial<
  Pick<
    Draft,
    | 'title'
    | 'company'
    | 'location'
    | 'workModel'
    | 'contractType'
    | 'description'
    | 'postedAt'
    | 'salaryMin'
    | 'salaryMax'
    | 'salaryCurrency'
    | 'salaryPeriod'
  >
> & {
  /** "há 1 mês", como estava no texto. */
  age?: string;
};

const MAX_DESCRIPTION = 20_000;
const DAY_MS = 86_400_000;

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const DESCRIPTION_START =
  /^(sobre a vaga|about the job|descricao da vaga|descricao|job description|sobre a oportunidade)$/;
const DESCRIPTION_END =
  /^(sobre a empresa|about the company|mostrar menos|exibir menos|ver menos|show less)$/;

/** Dias por unidade ("há 2 semanas" = 14 dias). Minutos e horas = hoje. */
const UNIT_DAYS: [RegExp, number][] = [
  [/^(minuto|minute|hora|hour)/, 0],
  [/^(dia|day)/, 1],
  [/^(semana|week)/, 7],
  [/^(mes|month)/, 30],
  [/^(ano|year)/, 365],
];
const AGE_PT =
  /^(?:(?:republicad[ao]|publicad[ao]|anunciad[ao])\s+)?ha\s+(\d+|um|uma)\s+(minutos?|horas?|dias?|semanas?|mes|meses|anos?)$/;
const AGE_EN =
  /^(?:reposted\s+|posted\s+)?(\d+|an?|one)\s+(minutes?|hours?|days?|weeks?|months?|years?)\s+ago$/;

/** "há 1 semana" → dias atrás. Não é idade → `null`. */
function ageInDays(segment: string): number | null {
  const value = fold(segment);
  const found = AGE_PT.exec(value) ?? AGE_EN.exec(value);
  if (!found) return null;
  const amount = /^\d+$/.test(found[1]!) ? Number(found[1]) : 1;
  const unit = UNIT_DAYS.find(([pattern]) => pattern.test(found[2]!));
  return unit ? amount * unit[1] : null;
}

const isApplicants = (segment: string) =>
  /candidat|clicaram|applicant|clicked|inscri/.test(fold(segment));

/** "Brasil (Remoto)" → lugar + modalidade; "Remoto" sozinho não é lugar. */
function splitPlace(text: string) {
  const inParens = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(text);
  if (inParens && workModelFromText(inParens[2]!)) {
    return { place: inParens[1]!.trim(), workModel: workModelFromText(inParens[2]!) };
  }
  const workModel = workModelFromText(text);
  const onlyMode =
    workModel &&
    /^(trabalho |vaga )?(100% )?(remoto|remota|home office|hibrido|hibrida|presencial|remote|hybrid|on-?site)$/.test(
      fold(text),
    );
  return { place: onlyMode ? '' : text, workModel };
}

const CHIP_CONTRACT: [RegExp, ContractType][] = [
  [/^(estagio|internship)$/, 'internship'],
  [/^(temporario|temporary)$/, 'temporary'],
];

/** Só um dos dois na descrição: "CLT ou PJ" não decide nada. */
function contractFromDescription(text: string): ContractType | null {
  const value = fold(text);
  const clt = /\bclt\b/.test(value);
  const pj = /\bpj\b|pessoa juridica/.test(value);
  return clt !== pj ? (clt ? 'clt' : 'pj') : null;
}

const parseBrl = (amount: string, thousands: boolean) => {
  const number = Number(amount.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(number) && number > 0 ? Math.round(number * (thousands ? 1000 : 1)) : null;
};

/** "R$ 3.000/mês - R$ 4.000/mês", "R$ 4 mil", "Salário: R$ 2.500,00". */
function salaryFromLine(line: string) {
  const amounts = [...line.matchAll(/R\$\s*([\d.,]+)\s*(mil\b|k\b)?/gi)].map((match) =>
    parseBrl(match[1]!, Boolean(match[2])),
  );
  if (amounts.length === 0 || amounts.some((amount) => amount === null)) return null;
  const [min, max = min] = amounts as number[];
  const value = fold(line);
  const period: SalaryPeriod = /\b(ano|anual|year|yr)\b/.test(value)
    ? 'year'
    : /\b(hora|hour|hr)\b/.test(value)
      ? 'hour'
      : 'month';
  return {
    salaryMin: Math.min(min!, max!),
    salaryMax: Math.max(min!, max!),
    salaryCurrency: 'BRL',
    salaryPeriod: period,
  };
}

const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function readPastedText(text: string, now: Date): PastedFields {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/[\s\u00a0]+/g, ' ').trim());
  const result: PastedFields = {};
  if (!lines.some(Boolean)) return result;

  // Descrição: de "Sobre a vaga" até "Sobre a empresa" (ou o fim).
  const start = lines.findIndex((line) => DESCRIPTION_START.test(fold(line).replace(/:$/, '')));
  const header = start >= 0 ? lines.slice(0, start) : lines;
  let body = start >= 0 ? lines.slice(start + 1) : lines;
  const end = body.findIndex((line) => DESCRIPTION_END.test(fold(line)));
  if (end >= 0) body = body.slice(0, end);
  const description = body
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (description) result.description = description.slice(0, MAX_DESCRIPTION);

  // A linha "local · há 1 semana · 100 candidaturas" mais perto da descrição.
  const filled = header.map((line, index) => ({ line, index })).filter(({ line }) => line);
  let chipsFrom = 0;
  for (let k = filled.length - 1; k >= 0; k--) {
    const segments = filled[k]!.line.split(/\s*[·•]\s*/).filter(Boolean);
    const ageAt = segments.findIndex((segment) => ageInDays(segment) !== null);
    if (ageAt < 0) continue;

    const days = ageInDays(segments[ageAt]!)!;
    result.age = segments[ageAt];
    result.postedAt = isoDay(new Date(now.getTime() - days * DAY_MS));
    const before = segments.slice(0, ageAt).filter((segment) => !isApplicants(segment));
    if (before.length > 0) {
      const { place, workModel } = splitPlace(before.at(-1)!);
      if (place) result.location = place;
      if (workModel) result.workModel = workModel;
    }
    // Formato antigo: "Empresa · Local · há 2 dias". Novo: empresa e título
    // nas duas linhas de cima.
    if (before.length > 1) result.company = before[0];
    const above = filled.slice(Math.max(0, k - 2), k).map(({ line }) => line);
    if (above.length === 2) {
      result.company ??= above[0];
      result.title = above[1];
    } else if (above.length === 1 && before.length > 1) {
      result.title = above[0];
    }
    chipsFrom = filled[k]!.index + 1;
    break;
  }

  // Etiquetas ("Remoto", "Tempo integral", "R$ 4 mil/mês") depois da linha da
  // data; sem ela, as linhas curtas do topo.
  const chips = header.slice(chipsFrom).filter((line) => line && line.length <= 120);
  for (const line of chips) {
    result.workModel ??= workModelFromText(line) ?? undefined;
    const contract = CHIP_CONTRACT.find(([pattern]) => pattern.test(fold(line)));
    if (contract) result.contractType ??= contract[1];
    if (result.salaryMin === undefined) Object.assign(result, salaryFromLine(line) ?? {});
  }
  if (result.salaryMin === undefined) {
    const line = body.find(
      (candidate) =>
        /R\$/.test(candidate) && /sal[aá]rio|remunera|faixa|bolsa|^R\$/i.test(candidate),
    );
    if (line) Object.assign(result, salaryFromLine(line) ?? {});
  }
  if (result.description)
    result.contractType ??= contractFromDescription(result.description) ?? undefined;

  return result;
}

/** "local, modalidade, data (há 1 mês), salário e descrição". */
export function describePasted(fields: PastedFields): string {
  const found = [
    fields.location && 'local',
    fields.workModel && 'modalidade',
    fields.age && `data (${fields.age})`,
    fields.salaryMin !== undefined && 'salário',
    fields.contractType && 'contrato',
    fields.description && 'descrição',
  ].filter(Boolean) as string[];
  if (found.length === 0) return 'Não achei os dados da vaga nesse texto.';
  const list = found.length === 1 ? found[0] : `${found.slice(0, -1).join(', ')} e ${found.at(-1)}`;
  return `Do texto: ${list}.`;
}
