import type { EntryItem, FieldItem } from './resume';

/**
 * Importar currículo de PDF, parte 1: das linhas de texto do PDF para um
 * rascunho estruturado. Só regras, sem IA (a IA é a Fase 4). O resultado
 * sempre passa por revisão antes de gravar.
 *
 * Plano: docs/features/12-resume-import.md
 */

/** Uma linha do PDF, já na ordem de leitura (o front extrai com o pdf.js). */
export interface ResumeImportLine {
  text: string;
  /** Tamanho da fonte, em pontos. */
  size: number;
  bold: boolean;
  page: number;
}

/** Seções que o importador reconhece. `other` = título desconhecido (vira texto). */
export type ImportSectionKey =
  | 'contact'
  | 'summary'
  | 'experience'
  | 'education'
  | 'projects'
  | 'skills'
  | 'languages'
  | 'courses'
  | 'other';

export interface ResumeImportDraft {
  name: string | null;
  /** Linha logo abaixo do nome ("Desenvolvedora Full Stack Júnior"). */
  headline: string | null;
  contact: {
    email: string | null;
    phone: string | null;
    linkedin: string | null;
    github: string | null;
    portfolio: string | null;
    location: string | null;
  };
  summary: string | null;
  experience: EntryItem[];
  education: EntryItem[];
  projects: EntryItem[];
  courses: EntryItem[];
  /** "Rótulo: valores" quando o PDF agrupa; senão um item sem rótulo por tecnologia. */
  skills: { label: string | null; values: string[] }[];
  languages: FieldItem[];
  /** Seções com título desconhecido, como texto. */
  other: { title: string; text: string }[];
  /** As seções reconhecidas, na ordem do PDF (para a revisão mostrar o que achou). */
  found: { key: ImportSectionKey; title: string }[];
}

/* ------------------------------------------------------------ texto */

/** Minúsculas, sem acento, espaços colapsados. */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

/* ---------------------------------------------------------- títulos */

/** Título de seção (sem acento, minúsculo) → seção. A ordem importa: o primeiro que casa vence. */
const HEADINGS: [ImportSectionKey, RegExp][] = [
  [
    'contact',
    /^(contato|contatos|contact|contact info(rmation)?|dados pessoais|informacoes pessoais|personal (info|information|details))$/,
  ],
  [
    'summary',
    /^(resumo( profissional)?|sobre( mim)?|perfil( profissional)?|objetivo( profissional)?|apresentacao|summary|professional summary|profile|about( me)?|objective)$/,
  ],
  [
    'experience',
    /^(experiencias?( profissiona(l|is))?( e estagios)?|historico profissional|experience|work experience|professional experience|employment( history)?|work history)$/,
  ],
  ['education', /^(formacao( academica)?|escolaridade|educacao|education|academic background)$/],
  [
    'projects',
    /^(projetos( pessoais| em destaque| relevantes| academicos| principais)?|principais projetos|projects|personal projects|featured projects|selected projects|portfolio)$/,
  ],
  [
    'skills',
    /^(competencias( tecnicas)?|habilidades( tecnicas)?|conhecimentos( tecnicos)?|tecnologias|skills|technical skills|tech stack|stack|hard skills|ferramentas)$/,
  ],
  ['languages', /^(idiomas|linguas|languages)$/],
  [
    'courses',
    /^(cursos( e certificacoes)?( complementares)?|certificacoes|certificados|certifications?|courses( and certifications)?|licenses( & certifications)?)$/,
  ],
];

function headingKey(text: string): ImportSectionKey | null {
  const folded = foldText(text)
    .replace(/[:•|\-–—]+$/, '')
    .trim();
  for (const [key, pattern] of HEADINGS) {
    if (pattern.test(folded)) return key;
  }
  return null;
}

/** Linha com cara de título: curta, sem número, e em destaque (negrito, CAIXA ALTA ou maior). */
function looksLikeHeading(line: ResumeImportLine, bodySize: number): boolean {
  const text = clean(line.text);
  const words = text.split(' ').length;
  if (words > 5 || text.length > 40 || /[\d@/]/.test(text)) return false;
  const upper = text === text.toUpperCase() && /[A-ZÀ-Ý]/.test(text);
  return (line.bold && upper) || (line.size >= bodySize + 1.5 && (line.bold || upper));
}

/** Tamanho mais comum de fonte, ponderado pelo texto: é o corpo do currículo. */
function bodyFontSize(lines: readonly ResumeImportLine[]): number {
  const weight = new Map<number, number>();
  for (const line of lines) {
    const size = Math.round(line.size * 2) / 2;
    weight.set(size, (weight.get(size) ?? 0) + line.text.length);
  }
  return [...weight].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 10;
}

/* ----------------------------------------------------------- contato */

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;
const PHONE = /(\+?55[\s.-]?)?\(?\b\d{2}\)?[\s.-]?9?\s?\d{4}[\s.-]?\d{4}\b/;
const LINKEDIN = /(https?:\/\/)?([a-z]{2,3}\.)?linkedin\.com\/in\/[\w%-]+\/?/i;
const GITHUB = /(https?:\/\/)?(www\.)?github\.com\/[\w-]+\/?/i;
const URL =
  /(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.(dev|com|com\.br|io|me|app|net|org|site|tech|page)(\/[\w./%-]*)?\b/i;
const UF = 'AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO';
const CITY_UF = new RegExp(
  `\\b([A-ZÀ-Ý][\\wÀ-ÿ'.]+(?:\\s+(?:d[aeo]s?\\s+)?[A-ZÀ-Ý][\\wÀ-ÿ'.]+)*)\\s*[,/–-]\\s*(${UF})\\b`,
);

/** Sem `https://`, `www.` e a barra final: é o que se cola no formulário. */
const bareUrl = (url: string) =>
  url
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '');

function readContact(text: string, contact: ResumeImportDraft['contact']): string {
  let rest = text;
  const take = (
    pattern: RegExp,
    key: keyof ResumeImportDraft['contact'],
    map = (s: string) => s,
  ) => {
    const found = pattern.exec(rest);
    if (!found) return;
    contact[key] ??= map(found[0].trim());
    rest = rest.replace(found[0], ' ');
  };
  take(EMAIL, 'email');
  take(LINKEDIN, 'linkedin', bareUrl);
  take(GITHUB, 'github', bareUrl);
  take(URL, 'portfolio', bareUrl);
  take(PHONE, 'phone');
  const city = CITY_UF.exec(rest);
  if (city) {
    contact.location ??= `${city[1]}, ${city[2]}`;
    rest = rest.replace(city[0], ' ');
  }
  return rest;
}

/** A linha é só contato (nada de útil sobra depois de tirar e-mail, telefone, links e cidade)? */
function isContactLine(text: string): boolean {
  const probe: ResumeImportDraft['contact'] = {
    email: null,
    phone: null,
    linkedin: null,
    github: null,
    portfolio: null,
    location: null,
  };
  const rest = readContact(text, probe);
  const found = Object.values(probe).some(Boolean);
  return found && foldText(rest).replace(/[^a-z0-9]+/g, '').length < 8;
}

/* ------------------------------------------------------------- datas */

const MONTHS: Record<string, number> = {
  jan: 1,
  janeiro: 1,
  january: 1,
  fev: 2,
  fevereiro: 2,
  feb: 2,
  february: 2,
  mar: 3,
  marco: 3,
  março: 3,
  march: 3,
  abr: 4,
  abril: 4,
  apr: 4,
  april: 4,
  mai: 5,
  maio: 5,
  may: 5,
  jun: 6,
  junho: 6,
  june: 6,
  jul: 7,
  julho: 7,
  july: 7,
  ago: 8,
  agosto: 8,
  aug: 8,
  august: 8,
  set: 9,
  setembro: 9,
  sep: 9,
  sept: 9,
  september: 9,
  out: 10,
  outubro: 10,
  oct: 10,
  october: 10,
  nov: 11,
  novembro: 11,
  november: 11,
  dez: 12,
  dezembro: 12,
  dec: 12,
  december: 12,
};
const MONTH_NAMES = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join('|');
const CURRENT = 'atual|atualmente|o momento|presente|hoje|present|current|now|today';
/** Um ponto no tempo: "jan/2025", "janeiro de 2025", "01/2025", "2025-01", "2025". */
const POINT = `(?:(?:${MONTH_NAMES})\\.?(?:\\s*(?:de|/|-|\\.)\\s*|\\s+)\\d{4}|\\d{1,2}\\s*[/.-]\\s*\\d{4}|\\d{4}-\\d{2}|\\b(?:19|20)\\d{2}\\b)`;
const RANGE = new RegExp(
  `(${POINT})\\s*(?:–|—|-|a|até|to|ate|~)\\s*(${POINT}|${CURRENT})|(?:desde|since)\\s+(${POINT})|(${POINT})`,
  'i',
);

function toYearMonth(point: string, end: boolean): string | null {
  const text = foldText(point);
  const iso = /^(\d{4})-(\d{2})$/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const numeric = /^(\d{1,2})\s*[/.-]\s*(\d{4})$/.exec(text);
  if (numeric) {
    const month = Number(numeric[1]);
    return month >= 1 && month <= 12 ? `${numeric[2]}-${String(month).padStart(2, '0')}` : null;
  }
  const named = new RegExp(`^(${MONTH_NAMES})\\.?\\D*(\\d{4})$`).exec(text);
  if (named) return `${named[2]}-${String(MONTHS[named[1]!]).padStart(2, '0')}`;
  const year = /^(\d{4})$/.exec(text);
  // Só o ano: início em janeiro, fim em dezembro (dá para corrigir na revisão).
  if (year) return `${year[1]}-${end ? '12' : '01'}`;
  return null;
}

export interface ParsedPeriod {
  startDate: string | null;
  endDate: string | null;
  current: boolean;
  /** O texto da linha sem o período (o que sobra: empresa, local...). */
  rest: string;
}

/** Acha o período numa linha. `null` = a linha não tem data. */
export function parsePeriod(text: string): ParsedPeriod | null {
  const found = RANGE.exec(text);
  if (!found) return null;
  const [whole, from, to, since, single] = found;
  const rest = clean(
    text
      .replace(whole!, ' ')
      .replace(/^[\s|·•,–—()-]+|[\s|·•,–—(-]+$/g, '')
      .replace(/\(\s*\)/g, '')
      // "Bacharelado — Previsão de conclusão: 12/2026": o rótulo sobra sem a data.
      .replace(
        /[\s—–-]*(previs[aã]o de (conclus[aã]o|formatura)|conclus[aã]o( prevista)?|formatura|expected graduation|graduation( date)?|expected)\s*:?\s*$/i,
        '',
      ),
  );
  if (since) {
    return { startDate: toYearMonth(since, false), endDate: null, current: true, rest };
  }
  if (from) {
    const current = new RegExp(`^(${CURRENT})$`, 'i').test(foldText(to!));
    return {
      startDate: toYearMonth(from, false),
      endDate: current ? null : toYearMonth(to!, true),
      current,
      rest,
    };
  }
  // Uma data só (curso, certificado): conta como a data de conclusão.
  return { startDate: null, endDate: toYearMonth(single!, true), current: false, rest };
}

/* ----------------------------------------------------------- entradas */

const BULLET = /^\s*[•▪◦●○■□‣⁃*–—-]\s+/;
/**
 * "Cargo — Empresa", "Cargo | Empresa", "Cargo at Empresa". Preposições em
 * português ficam de fora: "Bacharelado em Engenharia" é um título só.
 */
const TITLE_ORG = /\s+(?:—|–|-|\||@|·|at)\s+/;

interface EntryDraft {
  title: string;
  lines: string[];
  bullets: string[];
  period: ParsedPeriod | null;
}

function splitTitle(text: string): { title: string; organization: string | null } {
  const parts = text.split(TITLE_ORG);
  if (parts.length >= 2 && parts[0]!.length >= 2) {
    return { title: clean(parts[0]!), organization: clean(parts.slice(1).join(' — ')) };
  }
  return { title: clean(text), organization: null };
}

/** Linha com cara de cargo/curso (e não de empresa/escola). */
const ROLE =
  /\b(desenvolvedor|developer|engenheir[oa]|engineer|programador|analista|analyst|estagi[aá]ri|estagio|intern\b|trainee|auxiliar|assistente|assistant|tecnic[oa]\b|technician|coordenador|gerente|manager|lider|lead\b|consultor|consultant|arquitet|architect|designer|cientista|scientist|especialista|specialist|suporte|support|vendedor|atendente|operador|bacharel|bachelor|licenciatura|tecnolog|mestrado|master|doutorado|phd|mba\b|pos-graduacao|graduacao|tecnico em|ensino medio|high school|full stack|front-?end|back-?end)/;
const isRole = (text: string) => ROLE.test(foldText(text));

/** Local: "Americana, SP", "Remoto", "São Paulo - SP, Brasil". */
const isPlace = (text: string) =>
  CITY_UF.test(text) ||
  /^(remoto|remota|remote|hibrido|hibrida|hybrid|presencial|on-?site|home office)$/.test(
    foldText(text),
  );

/** "UNISALAmericana" (PDF sem o espaço) → "UNISAL Americana". */
const unglue = (text: string) => text.replace(/\b([A-Z]{3,})([A-Z][a-zà-ÿ]{2,})/g, '$1 $2');

/** "Sefer Pay (React Native · White-label)" → título e a lista de tecnologias. */
function splitTech(text: string): { title: string; tech: string | null } {
  const found = /^(.+?)\s*\(([^()]*[·,|][^()]*)\)\s*$/.exec(text);
  return found ? { title: clean(found[1]!), tech: clean(found[2]!) } : { title: text, tech: null };
}

/** Pedaços que descrevem o curso/vaga, não a empresa. */
const DETAIL =
  /\b(noturno|diurno|matutino|vespertino|integral|turno|semestre|periodo|ead|online|a distancia|evening|morning|program|semester|part-?time|full-?time|meio periodo|tempo integral|contrato|clt|pj|freelance)\b/;

const PIECES = /\s+[·|•]\s+|\s+[–—]\s+/;

/**
 * Monta a entrada. O layout varia: "Cargo — Empresa" numa linha, ou empresa
 * em negrito e o cargo embaixo (ou o contrário), com local e período em
 * qualquer canto. O que parece cargo/curso vira título; o lugar vira local;
 * o que sobra ("Noturno · 9º Semestre") abre a descrição.
 */
function toEntry(draft: EntryDraft): EntryItem {
  const { title: headText, tech } = splitTech(unglue(draft.title));
  const head = splitTitle(headText);
  const details: string[] = [];
  if (tech) details.push(tech);

  // Local e detalhes; as linhas sem lugar são candidatas a cargo/empresa.
  let location: string | null = null;
  const plain: string[] = [];
  const extras = [...(draft.period?.rest ? [draft.period.rest] : []), ...draft.lines];
  for (const extra of extras) {
    const pieces = unglue(extra).split(PIECES).map(clean).filter(Boolean);
    const placeIndex = pieces.findIndex(isPlace);
    if (placeIndex === -1) {
      plain.push(clean(unglue(extra)));
      continue;
    }
    location ??= pieces[placeIndex]!;
    for (const [index, piece] of pieces.entries()) {
      if (index === placeIndex) continue;
      // "Noturno · 9º Semestre" é detalhe; "Acme Tecnologia · São Paulo, SP", empresa.
      if (DETAIL.test(foldText(piece)) || /\d/.test(piece)) details.push(piece);
      else plain.push(piece);
    }
  }

  let title = head.title;
  let organization = head.organization;
  const [second, ...others] = plain;
  if (second) {
    if (isRole(second) && !isRole(head.title)) {
      // Empresa/escola em negrito, cargo/curso embaixo. Em "UNISAL — Engenharia
      // da Computação", o que vem depois do travessão é o curso: some.
      title = second;
      organization = head.title;
      if (head.organization && !foldText(second).includes(foldText(head.organization))) {
        details.push(head.organization);
      }
    } else if (!organization) {
      organization = second;
    } else {
      details.push(second);
    }
  }
  details.push(...others);

  const lines = [
    ...(details.length ? [details.join(' · ')] : []),
    ...draft.bullets.map((bullet) => `• ${bullet}`),
  ];
  return {
    title: title.slice(0, 200),
    organization: organization?.slice(0, 200) ?? null,
    location: location?.slice(0, 200) ?? null,
    startDate: draft.period?.startDate ?? null,
    endDate: draft.period?.endDate ?? null,
    current: draft.period?.current ?? false,
    description: lines.length ? lines.join('\n').slice(0, 5_000) : null,
  };
}

/**
 * Linhas de uma seção de entradas (experiência, formação...) → entradas.
 * Uma entrada nova começa numa linha em negrito (quando a seção usa negrito
 * para o cargo) ou numa linha comum depois de bullets/descrição.
 */
function parseEntries(lines: readonly ResumeImportLine[], oneLineEach: boolean): EntryItem[] {
  const usesBold = lines.some((line) => line.bold) && lines.some((line) => !line.bold);
  const entries: EntryDraft[] = [];
  let current: EntryDraft | null = null;

  for (const line of lines) {
    const text = clean(line.text);
    if (!text) continue;

    if (BULLET.test(text)) {
      const bullet = text.replace(BULLET, '');
      if (current) current.bullets.push(bullet);
      else current = { title: bullet, lines: [], bullets: [], period: null };
      continue;
    }

    const period = parsePeriod(text);
    const startsNew =
      !current ||
      oneLineEach ||
      (usesBold ? line.bold : current.bullets.length > 0 || (current.period !== null && !period));

    if (startsNew) {
      if (current) entries.push(current);
      if (period && !usesBold && period.rest) {
        // Linha única: "AWS Cloud Practitioner – Amazon (2025)".
        current = { title: period.rest, lines: [], bullets: [], period: { ...period, rest: '' } };
      } else {
        current = { title: text, lines: [], bullets: [], period: null };
        if (period && line.bold) {
          current.title = period.rest || text;
          current.period = { ...period, rest: '' };
        }
      }
      continue;
    }

    if (period && !current!.period) {
      current!.period = period;
    } else if (current!.bullets.length > 0) {
      // Continuação de um bullet quebrado em duas linhas.
      current!.bullets[current!.bullets.length - 1] += ` ${text}`;
    } else {
      current!.lines.push(text);
    }
  }
  if (current) entries.push(current);

  return entries.filter((entry) => entry.title.length > 0).map(toEntry);
}

/* ------------------------------------------- competências e idiomas */

/** Separa por vírgula, ";", "•", "|", "·" e " / " — mas não dentro de parênteses: "Python (OpenCV, YOLOv8)". */
function splitList(value: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let current = '';
  for (let index = 0; index < value.length; index++) {
    const char = value[index]!;
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    const slash = char === '/' && value[index - 1] === ' ' && value[index + 1] === ' ';
    if (depth === 0 && (/[,;•|·]/.test(char) || slash)) {
      items.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  items.push(current);
  return items.map(clean).filter((item) => item.length > 0 && item.length <= 60);
}

function parseSkills(lines: readonly ResumeImportLine[]): ResumeImportDraft['skills'] {
  // Linha quebrada: "..., Jira, agile" + "artifacts (Scrum/Kanban)" continua o grupo de cima.
  const texts: string[] = [];
  let previousLabeled = false;
  for (const line of lines) {
    const text = clean(line.text).replace(BULLET, '');
    const labeled = /^[^:]{2,40}:\s*\S/.test(text);
    if (!labeled && previousLabeled && texts.length > 0) {
      texts[texts.length - 1] += ` ${text}`;
      continue;
    }
    texts.push(text);
    previousLabeled = labeled;
  }

  const groups: ResumeImportDraft['skills'] = [];
  const loose: string[] = [];
  for (const text of texts) {
    const labeled = /^([^:]{2,40}):\s*(.+)$/.exec(text);
    if (labeled) groups.push({ label: clean(labeled[1]!), values: splitList(labeled[2]!) });
    else loose.push(...splitList(text));
  }
  if (loose.length) groups.push({ label: null, values: [...new Set(loose)] });
  return groups;
}

/** "Inglês Avançado", "Português Nativo" (sem separador). */
const LANGUAGE_LEVEL =
  /^([A-Za-zÀ-ÿ]{3,20})\s+((?:nativo|nativa|fluente|avançado|avancado|intermediário|intermediario|básico|basico|native|fluent|advanced|intermediate|basic|proficient|c[12]|b[12]|a[12])\b.*)$/i;

/** "Idiomas: Português Nativo · Inglês Avançado" — às vezes no cabeçalho. */
const LANGUAGES_INLINE = /^(idiomas|linguas|línguas|languages)\s*:\s*(.+)$/i;

function parseLanguages(lines: readonly ResumeImportLine[]): FieldItem[] {
  const items: FieldItem[] = [];
  for (const line of lines) {
    for (const part of clean(line.text)
      .replace(BULLET, '')
      .split(/\s*[;|•·,]\s*/)) {
      const found =
        /^([A-Za-zÀ-ÿ ]{3,30}?)\s*(?:[:–—-]|\()\s*([^)]+)\)?$/.exec(part) ??
        LANGUAGE_LEVEL.exec(part) ??
        /^([A-Za-zÀ-ÿ]{3,30})$/.exec(part);
      if (found) items.push({ label: clean(found[1]!), value: clean(found[2] ?? '') });
    }
  }
  return items;
}

/* ------------------------------------------------------------ parser */

/** Linhas do PDF → rascunho do currículo. Nunca lança: o que não reconhece fica em `other`. */
export function parseResumeLines(input: readonly ResumeImportLine[]): ResumeImportDraft {
  const lines = input.filter((line) => clean(line.text).length > 0);
  const bodySize = bodyFontSize(lines);
  const draft: ResumeImportDraft = {
    name: null,
    headline: null,
    contact: {
      email: null,
      phone: null,
      linkedin: null,
      github: null,
      portfolio: null,
      location: null,
    },
    summary: null,
    experience: [],
    education: [],
    projects: [],
    courses: [],
    skills: [],
    languages: [],
    other: [],
    found: [],
  };

  // 1. Nome: a maior fonte da 1ª página (fora títulos e contato); logo
  //    abaixo, o título profissional. Com duas colunas o nome pode estar
  //    no meio da ordem de leitura — por isso não é "a primeira linha".
  const isKnownHeading = (line: ResumeImportLine) =>
    headingKey(line.text) !== null && clean(line.text).split(' ').length <= 5;
  const candidates = lines.filter(
    (line) => line.page === lines[0]?.page && !isKnownHeading(line) && !isContactLine(line.text),
  );
  const biggest = [...candidates].sort((a, b) => b.size - a.size)[0];
  const nameLine =
    biggest && (biggest.size >= bodySize * 1.25 || biggest === lines[0]) ? biggest : null;
  const skip = new Set<ResumeImportLine>();
  if (nameLine) {
    draft.name = titleCase(clean(nameLine.text));
    skip.add(nameLine);
    const next = lines[lines.indexOf(nameLine) + 1];
    if (
      next &&
      !isKnownHeading(next) &&
      !isContactLine(next.text) &&
      clean(next.text).length <= 80 &&
      !parsePeriod(next.text)
    ) {
      draft.headline = clean(next.text);
      skip.add(next);
    }
  }

  // 2. Cabeçalho (antes do primeiro título) e blocos por seção.
  const header: ResumeImportLine[] = [];
  const blocks: { key: ImportSectionKey; title: string; lines: ResumeImportLine[] }[] = [];
  for (const line of lines) {
    if (skip.has(line)) continue;
    const known = headingKey(line.text);
    if ((known && isKnownHeading(line)) || looksLikeHeading(line, bodySize)) {
      blocks.push({ key: known ?? 'other', title: clean(line.text).replace(/:$/, ''), lines: [] });
      continue;
    }
    (blocks.at(-1)?.lines ?? header).push(line);
  }
  // No cabeçalho, além do contato: "Idiomas: ..." e o parágrafo de
  // apresentação (quando não há seção "Resumo").
  const intro: ResumeImportLine[] = [];
  for (const line of header) {
    const inline = LANGUAGES_INLINE.exec(clean(line.text));
    if (inline) {
      draft.languages.push(...parseLanguages([{ ...line, text: inline[2]! }]));
      continue;
    }
    if (isContactLine(line.text)) {
      readContact(line.text, draft.contact);
      continue;
    }
    const rest = readContact(line.text, draft.contact);
    if (foldText(rest).replace(/[^a-z0-9]+/g, '').length >= 8) intro.push(line);
  }

  // 3. Cada seção.
  for (const block of blocks) {
    draft.found.push({ key: block.key, title: block.title });
    const text = block.lines.map((line) => clean(line.text)).join('\n');
    switch (block.key) {
      case 'contact':
        for (const line of block.lines) readContact(line.text, draft.contact);
        break;
      case 'summary':
        draft.summary = joinParagraph(block.lines);
        break;
      case 'experience':
      case 'education':
      case 'projects':
        draft[block.key].push(...parseEntries(block.lines, false));
        break;
      case 'courses':
        draft.courses.push(...parseEntries(block.lines, !block.lines.some((l) => l.bold)));
        break;
      case 'skills':
        draft.skills.push(...parseSkills(block.lines));
        break;
      case 'languages':
        draft.languages.push(...parseLanguages(block.lines));
        break;
      case 'other':
        if (text) draft.other.push({ title: titleCase(block.title), text });
        break;
    }
  }

  // Sem seção "Resumo": o parágrafo do cabeçalho é a apresentação.
  if (!draft.summary && intro.length > 0) draft.summary = joinParagraph(intro);

  return draft;
}

/** Junta linhas quebradas de um parágrafo; bullets e linhas em branco viram quebra. */
function joinParagraph(lines: readonly ResumeImportLine[]): string | null {
  const out: string[] = [];
  for (const line of lines) {
    const text = clean(line.text);
    if (BULLET.test(text) || out.length === 0 || /[.!?:]$/.test(out.at(-1)!)) out.push(text);
    else out[out.length - 1] += ` ${text}`;
  }
  return out.join('\n') || null;
}

/** "MARIA FERNANDA SOUZA" → "Maria Fernanda Souza"; o resto fica como veio. */
function titleCase(text: string): string {
  if (text !== text.toUpperCase()) return text;
  return text
    .toLowerCase()
    .split(' ')
    .map((word) =>
      /^(d[aeo]s?|e)$/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ');
}
