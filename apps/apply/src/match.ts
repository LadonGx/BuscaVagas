import { classify, KEY_LABELS, type Answer, type Profile, type ProfileKey } from './profile.js';
import { fold, keywords } from './text.js';

/** Um campo do formulário, como a página descreve (scan.ts). */
export interface FieldInfo {
  /** `data-bv-id` que o scan pôs no elemento. */
  id: string;
  control:
    'text' | 'textarea' | 'email' | 'tel' | 'url' | 'number' | 'date' | 'select' | 'radio' | 'file';
  /** Texto da pergunta: `<label>`, aria-label, legenda ou o texto em volta. */
  label: string;
  name: string;
  htmlId: string;
  placeholder: string;
  autocomplete: string;
  /** Opções de `select` e `radio`, na ordem da página. */
  options: string[];
  accept: string;
  maxLength: number | null;
}

export type SkipReason =
  'sensitive' | 'no-answer' | 'ambiguous' | 'no-option' | 'too-long' | 'format' | 'photo';

export type Decision =
  /** `from`: de onde veio a resposta (rótulo no currículo). */
  | { kind: 'value'; value: string; from: string }
  | { kind: 'option'; index: number; from: string }
  | { kind: 'resume-file' }
  | { kind: 'skip'; reason: SkipReason; detail?: string };

/**
 * Campos que nunca são preenchidos, mesmo com o dado à mão: senha, documento,
 * cartão, captcha. Quem preenche é você.
 */
const SENSITIVE =
  /\b(senha|password|passwd|cpf|rg|cnh|pis|nis|ctps|passaporte|passport|ssn|cartao|card|cvv|cvc|captcha|token|codigo de verificacao|verification code|nome social|nome da mae|nome do pai|mother|father|conta bancaria|agencia|pix)\b/;
const PHOTO = /\b(foto|fotos|photo|imagem|image|avatar|selfie)\b/;
/** O campo de arquivo diz que é o currículo. */
const RESUME_FILE = /\b(curriculos?|curriculum|cv|resumes?)\b/;
/**
 * Arquivo que não é o currículo, mesmo que o rótulo cite o currículo junto
 * ("Currículo ou portfólio"): documento, comprovante, certificado...
 */
const NOT_RESUME_FILE =
  /\b(documentos? (de identificacao|de identidade|pessoa(l|is)|oficia(l|is))|identidade|identificacao|identity|id card|rg|cpf|cnh|comprovantes?|proof|certificados?|certificates?|certidao|certidoes|diplomas?|historico escolar|transcript|carteira|carteirinha|atestados?|laudos?|declaracao|reservista|titulo de eleitor|passaporte|passport|portfolio|portifolio|carta|cover letter)\b/;
/** Tipos aceitos que incluem o PDF. Vazio = qualquer arquivo; `image/*` não serve. */
const PDF_ACCEPT = new Set(['.pdf', 'pdf', 'application/pdf', '*/*']);
/**
 * Num campo `type=tel`, palavras que dizem que não é telefone (CEP, documento,
 * valor...): aí o tipo do campo não decide.
 */
const NOT_PHONE =
  /\b(cep|codigo postal|postal|zip|zipcode|identidade|identificacao|documento|document|rg|cpf|cnpj|pis|nis|matricula|registro|salario|salarial|pretensao|remuneracao|valor|idade|ano|anos|quantidade|numero (da casa|do endereco|da residencia)|endereco)\b/;
const PLACEHOLDER_OPTION = /^(selecione|escolha|select|choose|--|-)/;

/** Os textos que descrevem o campo, do mais confiável para o menos. */
function descriptions(field: FieldInfo): string[] {
  return [field.label, field.placeholder, field.name, field.htmlId].filter((text) => text.trim());
}

const AUTOCOMPLETE: Record<string, ProfileKey> = {
  name: 'fullName',
  'given-name': 'firstName',
  'family-name': 'lastName',
  email: 'email',
  tel: 'phone',
  'tel-national': 'phone',
  'address-level2': 'city',
  'address-level1': 'state',
  bday: 'birthDate',
  url: 'portfolio',
};

/** Qual dado conhecido o campo pede? */
export function fieldKey(field: FieldInfo): ProfileKey | null {
  const auto = AUTOCOMPLETE[field.autocomplete.trim().toLowerCase().split(/\s+/).at(-1) ?? ''];
  if (auto) return auto;
  for (const text of descriptions(field)) {
    const key = classify(text);
    if (key) return key;
  }
  return null;
}

/**
 * Pelo tipo do campo (`type=email`, `type=tel`): só quando nada no rótulo diz
 * o que é e nenhuma resposta salva serve. `type=tel` com "CEP", "Documento" ou
 * "Pretensão" não é telefone.
 */
function controlKey(field: FieldInfo): ProfileKey | null {
  if (field.control === 'email') return 'email';
  if (field.control === 'tel' && !descriptions(field).some((text) => NOT_PHONE.test(fold(text)))) {
    return 'phone';
  }
  return null;
}

/** O campo de arquivo aceita PDF? Sem `accept` ou com qualquer tipo, sim; só imagem, não. */
export function acceptsPdf(accept: string): boolean {
  const types = accept
    .toLowerCase()
    .split(',')
    .map((type) => type.trim())
    .filter(Boolean);
  return types.length === 0 || types.some((type) => PDF_ACCEPT.has(type));
}

/**
 * Quanto o rótulo da resposta salva combina com a pergunta. As palavras fora
 * dos parênteses precisam estar quase todas na pergunta (60%; com duas
 * palavras, as duas); as de dentro ("(CLT)") desempatam.
 */
export function answerScore(answerLabel: string, question: string): number {
  const inside = [...answerLabel.matchAll(/\(([^)]*)\)/g)].map((match) => match[1]!).join(' ');
  const main = keywords(answerLabel.replace(/\([^)]*\)/g, ' '));
  if (main.length === 0) return 0;
  const words = new Set(keywords(question));
  const matched = main.filter((word) => words.has(word)).length;
  const ratio = matched / main.length;
  if (ratio < 0.6 || (main.length === 2 && matched < 2)) return 0;
  const bonus = keywords(inside).filter((word) => words.has(word)).length;
  return ratio + 0.25 * bonus;
}

function bestAnswer(
  answers: readonly Answer[],
  question: string,
): { answer: Answer } | { ambiguous: string } | null {
  const scored = answers
    .map((answer) => ({ answer, score: answerScore(answer.label, question) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
  const [first, second] = scored;
  if (!first) return null;
  if (second && second.score === first.score && second.answer.value !== first.answer.value) {
    const tied = scored
      .filter(({ score }) => score === first.score)
      .map(({ answer }) => answer.label);
    return { ambiguous: tied.join(', ') };
  }
  return { answer: first.answer };
}

/** A opção da lista que é a resposta ("Avançado" → "Avançado (C1)"). */
export function pickOption(options: readonly string[], value: string): number | null {
  const wanted = fold(value);
  if (!wanted) return null;
  const folded = options.map((option) => fold(option));
  const exact = folded.findIndex((option) => option === wanted);
  if (exact >= 0) return exact;
  const close = folded
    .map((option, index) => ({ option, index }))
    .filter(
      ({ option }) =>
        option &&
        !PLACEHOLDER_OPTION.test(option) &&
        (option.startsWith(`${wanted} `) || wanted.startsWith(`${option} `)),
    );
  return close.length === 1 ? close[0]!.index : null;
}

/** "15/03/1999" → "1999-03-15" (campo de data); outro formato → `null`. */
export function toIsoDate(value: string): string | null {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const found = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(trimmed);
  if (!found) return null;
  const [, day, month, year] = found;
  return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
}

/** "R$ 4.500,00" → "4500"; "4 mil" → "4000"; sem número → `null`. */
export function toNumber(value: string): string | null {
  const found = /(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?\s*(mil\b|k\b)?/i.exec(value);
  if (!found) return null;
  const whole = Number(found[1]!.replace(/\./g, ''));
  const number = (whole + (found[2] ? Number(`0.${found[2]}`) : 0)) * (found[3] ? 1000 : 1);
  return Number.isFinite(number) ? String(Math.round(number * 100) / 100) : null;
}

/** A resposta no formato do campo. */
function shape(field: FieldInfo, value: string, from: string): Decision {
  if (field.control === 'select' || field.control === 'radio') {
    const index = pickOption(field.options, value);
    return index === null
      ? { kind: 'skip', reason: 'no-option', detail: value }
      : { kind: 'option', index, from };
  }
  let text: string | null = value;
  if (field.control === 'date') text = toIsoDate(value);
  if (field.control === 'number') text = toNumber(value);
  if (text === null) return { kind: 'skip', reason: 'format', detail: value };
  if (field.maxLength !== null && field.maxLength > 0 && text.length > field.maxLength) {
    return { kind: 'skip', reason: 'too-long', detail: `${text.length} de ${field.maxLength}` };
  }
  return { kind: 'value', value: text, from };
}

/** "resumeUpload" → "resume Upload": nomes técnicos em camelCase também contam. */
const splitCamel = (text: string) => text.replace(/([a-z])([A-Z])/g, '$1 $2');

/**
 * O que fazer com um campo. Só decide: quem mexe na página é o filler, e só
 * em campo vazio.
 *
 * `onlyFileInPage`: é o único campo de arquivo da página inteira (todos os
 * quadros). Só aí um campo de arquivo sem rótulo nem placeholder recebe o
 * currículo.
 */
export function decide(field: FieldInfo, profile: Profile, onlyFileInPage = false): Decision {
  const texts = descriptions(field).map(fold);
  if (texts.some((text) => SENSITIVE.test(text))) return { kind: 'skip', reason: 'sensitive' };

  if (field.control === 'file') {
    const fileTexts = descriptions(field).map((text) => fold(splitCamel(text)));
    if (fileTexts.some((text) => PHOTO.test(text))) return { kind: 'skip', reason: 'photo' };
    if (fileTexts.some((text) => NOT_RESUME_FILE.test(text))) {
      return { kind: 'skip', reason: 'no-answer' };
    }
    if (!acceptsPdf(field.accept)) return { kind: 'skip', reason: 'format' };
    const saysResume = fileTexts.some((text) => RESUME_FILE.test(text));
    const unlabeled = !field.label.trim() && !field.placeholder.trim();
    return saysResume || (unlabeled && onlyFileInPage)
      ? { kind: 'resume-file' }
      : { kind: 'skip', reason: 'no-answer' };
  }

  const key = fieldKey(field);
  if (key) {
    // Resumo só em caixa de texto grande: num campo de uma linha, não.
    if (key === 'summary' && field.control !== 'textarea') {
      return { kind: 'skip', reason: 'no-answer' };
    }
    const value = profile.values[key];
    if (value) return shape(field, value, KEY_LABELS[key]);
    // Sem o dado, a pergunta pode estar entre as respostas salvas.
  }

  const question = field.label || field.placeholder || field.name;
  const found = bestAnswer(profile.answers, question);
  if (found && 'ambiguous' in found) {
    return { kind: 'skip', reason: 'ambiguous', detail: found.ambiguous };
  }
  if (found) return shape(field, found.answer.value, found.answer.label);

  // Por último, o tipo do campo: e-mail e telefone sem rótulo que diga outra coisa.
  const fallback = key ? null : controlKey(field);
  const value = fallback ? profile.values[fallback] : undefined;
  if (fallback && value) return shape(field, value, KEY_LABELS[fallback]);
  return { kind: 'skip', reason: 'no-answer' };
}
