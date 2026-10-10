import type { JobPosting } from '@busca-vagas/shared';
import type { z } from 'zod';
import type { HttpClient } from './http';

/**
 * Duas famílias de fonte vivem atrás do mesmo contrato:
 *
 *   search          responde a um termo sobre o acervo inteiro (Gupy,
 *                   RemoteOK...). Volume alto, pouca curadoria.
 *   company-board   lê o board de uma empresa por vez (Greenhouse, Lever,
 *                   Ashby) e precisa de uma lista de empresas. Precisão alta.
 */
export type SourceKind = 'search' | 'company-board';

export interface SourceQuery {
  /**
   * Termos de busca. As fontes `search` fazem uma busca por termo e juntam o
   * resultado; as `company-board` ignoram.
   */
  terms?: readonly string[];
  /** Slugs das empresas acompanhadas. Só as fontes `company-board` usam. */
  companies?: readonly string[];
}

export interface SourceContext {
  http: HttpClient;
  /** Cancelado quando o prazo da fonte estoura. Repasse para o http. */
  signal: AbortSignal;
  log: (message: string) => void;
}

export interface SourceResult {
  jobs: JobPosting[];
  /** Itens que vieram da fonte mas não passaram na validação. */
  dropped: number;
}

export interface JobSource {
  /** Identificador estável: vai para o banco, para o .env e para os logs. */
  readonly id: string;
  readonly displayName: string;
  readonly kind: SourceKind;
  /** Prazo próprio, quando o padrão não serve (ex.: uma requisição por vaga). */
  readonly timeoutMs?: number;

  fetch(query: SourceQuery, ctx: SourceContext): Promise<SourceResult>;
}

/** Variáveis de ambiente como chegam do processo (`process.env`). */
export type EnvLike = Record<string, string | undefined>;

/**
 * O "módulo" de uma fonte, visto de fora: tudo que a API precisa para
 * configurar e criar a fonte sem saber nada dela.
 *
 * A configuração é DA FONTE: cada uma lê do `.env` só as variáveis com o seu
 * prefixo (`GUPY_*`), valida com o próprio schema e aplica os próprios padrões.
 */
export interface SourceDefinition<Config = unknown> {
  readonly id: string;
  readonly displayName: string;
  readonly kind: SourceKind;
  /** Lê e valida a configuração da fonte. Valor inválido lança, com a variável no texto. */
  parseConfig(env: EnvLike): Config;
  create(config: Config): JobSource;
}

/**
 * Helper para as fontes: valida as variáveis com prefixo usando um schema Zod
 * cujas chaves são os nomes SEM o prefixo (ex.: `MAX_PAGES` para `GUPY_MAX_PAGES`).
 */
export function parseSourceEnv<S extends z.ZodObject>(
  prefix: string,
  schema: S,
  env: EnvLike,
): z.output<S> {
  const raw: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith(prefix) && value !== undefined && value !== '') {
      raw[key.slice(prefix.length)] = value;
    }
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${prefix}${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuração inválida da fonte: ${issues}`);
  }

  return result.data;
}
