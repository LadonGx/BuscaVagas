import type { JobPosting } from '@busca-vagas/shared';
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
  /** Texto livre. As fontes `search` usam; as `company-board` ignoram. */
  term?: string;
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
