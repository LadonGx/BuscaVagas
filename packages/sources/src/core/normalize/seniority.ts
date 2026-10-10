import type { SeniorityLevel } from '@busca-vagas/shared';
import { fold } from './text';

/**
 * Senioridade pelo título da vaga. A ordem das regras é a prioridade: um
 * "Tech Lead Sênior" é `lead`; um "Estágio em Desenvolvimento" é `intern`.
 *
 * Título sem pista → `null`. Chutar "pleno" para quem não disse nada
 * esconderia a vaga de quem filtra por júnior.
 */
const RULES: { level: SeniorityLevel; pattern: RegExp }[] = [
  { level: 'intern', pattern: /\b(estagio|estagiari[oa]|internship|intern|aprendiz)\b/ },
  { level: 'trainee', pattern: /\btrainee\b/ },
  {
    level: 'lead',
    pattern: /\b(tech lead|techlead|lider tecnic[oa]|lead|staff|principal|head|coordenador[a]?)\b/,
  },
  { level: 'senior', pattern: /\b(senior|sr|iii|especialista)\b/ },
  { level: 'mid', pattern: /\b(pleno|pl|mid|ii)\b/ },
  // "I" isolado só no fim do título ("Desenvolvedor I"): no meio é ruído.
  { level: 'junior', pattern: /\b(junior|jr)\b|\si$/ },
];

export function seniorityFromTitle(title: string): SeniorityLevel | null {
  // Pontuação vira espaço: "Sr." e "Jr/Pl" precisam casar com \b.
  const text = fold(title).replace(/[.,/|()[\]–-]+/g, ' ');

  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      return rule.level;
    }
  }

  return null;
}
