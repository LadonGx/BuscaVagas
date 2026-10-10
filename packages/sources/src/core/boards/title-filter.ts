import { fold } from '../normalize/text';

/**
 * "É vaga de tecnologia?" pelo título — para boards de empresa, que trazem
 * todas as vagas (vendas, jurídico, RH...).
 *
 * Casa por palavra inteira, sem acento e sem pontuação: "Front-End" casa com
 * "front end", "Desenvolvedor(a)" com "desenvolvedor". Exclusão vence
 * inclusão: "Sales Engineer" tem "engineer", mas não é vaga de dev.
 */
export const DEFAULT_TITLE_KEYWORDS = [
  // pt
  'desenvolvedor',
  'desenvolvedora',
  'dev',
  'programador',
  'programadora',
  'engenheiro',
  'engenheira',
  'analista de sistemas',
  'arquiteto de software',
  'arquiteta de software',
  'testes',
  // en
  'developer',
  'programmer',
  'engineer',
  'engineering',
  'software',
  'tester',
  'sdet',
  'quality assurance',
  // áreas
  'frontend',
  'front end',
  'backend',
  'back end',
  'fullstack',
  'full stack',
  'mobile',
  'android',
  'ios',
  'qa',
  'devops',
  'sre',
  'site reliability',
  'tech lead',
];

export const DEFAULT_TITLE_EXCLUDE = [
  'sales engineer',
  'sales engineering',
  'business developer',
  'business development',
  'business dev',
  'sales development',
  'desenvolvedor de negocios',
  'desenvolvimento de negocios',
  'recruiter',
  'recrutador',
  'recrutadora',
  'talent acquisition',
  'engenheiro civil',
  'engenheira civil',
  'engenheiro eletricista',
  'engenheira eletricista',
  'engenheiro mecanico',
  'engenheira mecanica',
  'engenheiro de producao',
  'engenheira de producao',
  'engenheiro quimico',
  'engenheira quimica',
  'engenheiro agronomo',
  'engenheira agronoma',
  'engenheiro ambiental',
  'engenheira ambiental',
  'seguranca do trabalho',
  'civil engineer',
  'mechanical engineer',
  'electrical engineer',
  'chemical engineer',
];

/** Minúsculas, sem acento, só letras/números, com espaço nas pontas. */
function normalize(text: string): string {
  return ` ${fold(text)
    .replace(/[^a-z0-9#+]+/g, ' ')
    .trim()} `;
}

export type TitleMatcher = (title: string) => boolean;

export function createTitleMatcher(
  keywords: readonly string[] = DEFAULT_TITLE_KEYWORDS,
  exclude: readonly string[] = DEFAULT_TITLE_EXCLUDE,
): TitleMatcher {
  const include = keywords.map(normalize).filter((word) => word.trim());
  const skip = exclude.map(normalize).filter((word) => word.trim());

  return (title) => {
    const text = normalize(title);
    if (skip.some((word) => text.includes(word))) return false;
    return include.some((word) => text.includes(word));
  };
}
