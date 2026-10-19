import type { ResumeSectionDto } from '@busca-vagas/shared';
import { fold } from './text.js';

/**
 * Os dados do currículo do app (tela Currículo) que o preenchimento usa.
 * Os campos conhecidos (nome, e-mail, telefone, links...) viram chaves; o
 * resto dos campos, como "Respostas prontas" e "Idiomas", vira resposta por
 * rótulo, casada com a pergunta do formulário (match.ts).
 */
export const PROFILE_KEYS = [
  'fullName',
  'firstName',
  'lastName',
  'email',
  'phone',
  'location',
  'city',
  'state',
  'linkedin',
  'github',
  'portfolio',
  'birthDate',
  'summary',
] as const;
export type ProfileKey = (typeof PROFILE_KEYS)[number];

export interface Answer {
  /** Rótulo no currículo ("Pretensão salarial (CLT)"). */
  label: string;
  value: string;
}

export interface Profile {
  values: Partial<Record<ProfileKey, string>>;
  answers: Answer[];
}

/** Como o app chama cada chave nas mensagens. */
export const KEY_LABELS: Record<ProfileKey, string> = {
  fullName: 'Nome completo',
  firstName: 'Nome',
  lastName: 'Sobrenome',
  email: 'E-mail',
  phone: 'Telefone',
  location: 'Cidade/UF',
  city: 'Cidade',
  state: 'Estado',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  portfolio: 'Portfólio',
  birthDate: 'Data de nascimento',
  summary: 'Resumo profissional',
};

/**
 * Rótulo → chave. A ordem importa: "Cidade/UF" é `location` antes de ser
 * `city`; "Nome" só sozinho (não "Nome da empresa").
 */
const RULES: [ProfileKey, RegExp][] = [
  ['birthDate', /\b(data de nascimento|nascimento|birth ?date|birthday|date of birth|dob)\b/],
  ['linkedin', /\blinked ?in\b/],
  ['github', /\bgit ?hub\b/],
  [
    'portfolio',
    /\b(portfolio|portifolio|website|web site|site pessoal|personal (site|website)|blog)\b/,
  ],
  ['email', /\b(e ?mail|email address)\b/],
  ['phone', /\b(telefone|celular|whats ?app|phone|mobile|fone|tel|contato telefonico)\b/],
  ['firstName', /\b(primeiro nome|first ?name|given ?name|fname)\b/],
  ['lastName', /\b(sobrenome|ultimo nome|last ?name|surname|family ?name|lname)\b/],
  [
    'fullName',
    /^(seu |your )?(nome|nome completo|full ?name|name|nome e sobrenome|candidate name|nome do candidato)$/,
  ],
  [
    'location',
    /\b(cidade ?(e|\/)? ?(uf|estado)|localizacao|location|onde (voce )?mora|where do you live|city ?(and )?state)\b/,
  ],
  ['city', /\b(cidade|city|municipio|town)\b/],
  ['state', /^(estado|uf|state|province)$|^(estado|state) ?uf$/],
  [
    'summary',
    /\b(resumo( profissional)?|sobre (voce|mim)|fale (um pouco )?sobre (voce|sua trajetoria)|apresentacao pessoal|carta de apresentacao|about (you|yourself|me)|cover letter|summary)\b/,
  ],
];

/** O rótulo é de um dado conhecido? `null` = resposta comum. */
export function classify(label: string): ProfileKey | null {
  const text = fold(label);
  if (!text) return null;
  return RULES.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

/** "Americana/SP", "Americana - SP", "Americana, SP" → cidade e UF. */
export function splitLocation(value: string): { city: string; state: string | null } {
  const found = /^(.+?)\s*(?:\/|-|,|–)\s*([A-Za-zÀ-ÿ ]{2,})$/.exec(value.trim());
  return found
    ? { city: found[1]!.trim(), state: found[2]!.trim() }
    : { city: value.trim(), state: null };
}

interface FieldData {
  label?: unknown;
  value?: unknown;
}
interface TextData {
  text?: unknown;
}

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export function buildProfile(sections: readonly ResumeSectionDto[]): Profile {
  const values: Partial<Record<ProfileKey, string>> = {};
  const answers: Answer[] = [];

  for (const section of sections) {
    if (section.kind === 'text') {
      if (classify(section.title) !== 'summary' || values.summary) continue;
      const text = section.items
        .map((item) => str((item.data as TextData).text))
        .filter(Boolean)
        .join('\n\n');
      if (text) values.summary = text;
      continue;
    }
    if (section.kind !== 'fields') continue;
    for (const item of section.items) {
      const data = item.data as FieldData;
      const label = str(data.label);
      const value = str(data.value);
      if (!label || !value) continue;
      const key = classify(label);
      if (key && key !== 'summary') values[key] ??= value;
      else answers.push({ label, value });
    }
  }

  if (values.location) {
    const { city, state } = splitLocation(values.location);
    values.city ??= city;
    if (state) values.state ??= state;
  } else if (values.city) {
    values.location = values.state ? `${values.city}/${values.state}` : values.city;
  }
  if (values.fullName) {
    const [first, ...rest] = values.fullName.split(/\s+/);
    values.firstName ??= first;
    if (rest.length > 0) values.lastName ??= rest.join(' ');
  }

  return { values, answers };
}
