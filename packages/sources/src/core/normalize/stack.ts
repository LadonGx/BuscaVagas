import { fold } from './text';

/**
 * Tecnologias reconhecidas no título e na descrição.
 *
 * Cada entrada é o nome canônico (o que vai para `JobPosting.stack`) e o
 * padrão que o encontra no texto já sem acento e em minúsculas. Termos curtos
 * e ambíguos ficam de fora de propósito: "go" (verbo em inglês), "r" e "c"
 * marcariam vagas que não têm nada a ver.
 *
 * Para adicionar uma tecnologia: uma linha aqui + um caso no teste.
 */
const TECHNOLOGIES: { name: string; pattern: RegExp }[] = [
  // linguagens
  { name: 'typescript', pattern: /\btypescript\b|\bts\b(?=[\s,/])/ },
  { name: 'javascript', pattern: /\bjavascript\b|\becmascript\b/ },
  { name: 'java', pattern: /\bjava\b(?!\s*script)/ },
  { name: 'kotlin', pattern: /\bkotlin\b/ },
  { name: 'python', pattern: /\bpython\b/ },
  { name: 'php', pattern: /\bphp\b/ },
  { name: 'c#', pattern: /(^|[^a-z0-9])c#/ },
  { name: 'golang', pattern: /\bgolang\b/ },
  { name: 'rust', pattern: /\brust\b/ },
  { name: 'ruby', pattern: /\bruby\b/ },
  { name: 'swift', pattern: /\bswift\b/ },
  { name: 'dart', pattern: /\bdart\b/ },
  { name: 'delphi', pattern: /\bdelphi\b/ },
  { name: 'sql', pattern: /\bsql\b(?!\s*server)/ },
  // front / mobile
  { name: 'react', pattern: /\breact(\.?js)?\b(?!\s*native)/ },
  { name: 'react native', pattern: /\breact\s*native\b/ },
  { name: 'next.js', pattern: /\bnext\.?js\b/ },
  { name: 'angular', pattern: /\bangular(js)?\b/ },
  { name: 'vue', pattern: /\bvue(\.?js)?\b/ },
  { name: 'flutter', pattern: /\bflutter\b/ },
  { name: 'html', pattern: /\bhtml5?\b/ },
  { name: 'css', pattern: /\bcss3?\b/ },
  { name: 'tailwind', pattern: /\btailwind(css)?\b/ },
  // back
  { name: 'node.js', pattern: /\bnode(\.?js)?\b/ },
  { name: 'nestjs', pattern: /\bnest\.?js\b/ },
  { name: 'express', pattern: /\bexpress(\.?js)?\b/ },
  { name: '.net', pattern: /(^|\s)\.net\b|\bdotnet\b|\basp\.net\b/ },
  { name: 'spring', pattern: /\bspring(\s*boot)?\b/ },
  { name: 'django', pattern: /\bdjango\b/ },
  { name: 'flask', pattern: /\bflask\b/ },
  { name: 'fastapi', pattern: /\bfastapi\b/ },
  { name: 'laravel', pattern: /\blaravel\b/ },
  { name: 'rails', pattern: /\b(ruby on )?rails\b/ },
  { name: 'graphql', pattern: /\bgraphql\b/ },
  // dados
  { name: 'postgresql', pattern: /\bpostgres(ql)?\b/ },
  { name: 'mysql', pattern: /\bmysql\b/ },
  { name: 'sql server', pattern: /\bsql\s*server\b|\bmssql\b/ },
  { name: 'oracle', pattern: /\boracle\b/ },
  { name: 'mongodb', pattern: /\bmongo(db)?\b/ },
  { name: 'redis', pattern: /\bredis\b/ },
  { name: 'elasticsearch', pattern: /\belastic\s*search\b/ },
  { name: 'kafka', pattern: /\bkafka\b/ },
  { name: 'rabbitmq', pattern: /\brabbit\s*mq\b/ },
  { name: 'firebase', pattern: /\bfirebase\b/ },
  { name: 'power bi', pattern: /\bpower\s*bi\b/ },
  // infra / ferramentas
  { name: 'docker', pattern: /\bdocker\b/ },
  { name: 'kubernetes', pattern: /\bkubernetes\b|\bk8s\b/ },
  { name: 'aws', pattern: /\baws\b|\bamazon web services\b/ },
  { name: 'azure', pattern: /\bazure\b/ },
  { name: 'gcp', pattern: /\bgcp\b|\bgoogle cloud\b/ },
  { name: 'terraform', pattern: /\bterraform\b/ },
  { name: 'linux', pattern: /\blinux\b/ },
  { name: 'git', pattern: /\bgit\b(?!hub|lab)/ },
  { name: 'ci/cd', pattern: /\bci\s*\/\s*cd\b|\bgithub actions\b|\bgitlab ci\b|\bjenkins\b/ },
  { name: 'jest', pattern: /\bjest\b/ },
  { name: 'cypress', pattern: /\bcypress\b/ },
];

/** Tecnologias citadas no texto, na ordem da lista acima, sem repetição. */
export function stackFromText(...texts: (string | null | undefined)[]): string[] {
  const text = fold(texts.filter(Boolean).join(' \n '));
  if (!text) {
    return [];
  }

  return TECHNOLOGIES.filter((tech) => tech.pattern.test(text)).map((tech) => tech.name);
}
