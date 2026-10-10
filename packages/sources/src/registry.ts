import type { EnvLike, JobSource, SourceDefinition } from './core/job-source';
import { gupySourceDefinition } from './gupy';

/**
 * Todas as fontes disponíveis. Para adicionar uma: crie a pasta dela a partir
 * de `src/_template/` e coloque a definição aqui — ver docs/ADDING_A_SOURCE.md.
 *
 * A ordem importa: em vaga duplicada entre fontes, vence a que vem primeiro.
 * Coloque antes as fontes que trazem dados mais completos.
 */
export const SOURCE_DEFINITIONS: readonly SourceDefinition<never>[] = [
  gupySourceDefinition as SourceDefinition<never>,
];

export interface BuildSourcesResult {
  /** Fontes prontas, na ordem do registro. */
  sources: JobSource[];
  /** Ids pedidos em `enabledIds` que não existem no registro. */
  unknown: string[];
  /** Fontes que não puderam ser criadas (configuração inválida). */
  errors: { sourceId: string; message: string }[];
}

/**
 * Cria as fontes ativas, cada uma com a própria configuração lida do `env`.
 * Sem `enabledIds` (ou lista vazia), todas. Uma fonte com configuração
 * inválida fica de fora e é reportada em `errors` — as outras sobem normalmente.
 */
export function buildSources(
  env: EnvLike,
  enabledIds?: readonly string[],
  definitions: readonly SourceDefinition<never>[] = SOURCE_DEFINITIONS,
): BuildSourcesResult {
  const wanted = enabledIds && enabledIds.length > 0 ? new Set(enabledIds) : null;
  const known = new Set(definitions.map((definition) => definition.id));

  const result: BuildSourcesResult = {
    sources: [],
    unknown: wanted ? [...wanted].filter((id) => !known.has(id)) : [],
    errors: [],
  };

  for (const definition of definitions) {
    if (wanted && !wanted.has(definition.id)) {
      continue;
    }

    try {
      result.sources.push(definition.create(definition.parseConfig(env)));
    } catch (error) {
      result.errors.push({
        sourceId: definition.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
