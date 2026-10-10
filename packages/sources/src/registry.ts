import type { EnvLike, JobSource, SourceDefinition, SourceKind } from './core/job-source';
import { ashbySourceDefinition } from './ashby';
import { greenhouseSourceDefinition } from './greenhouse';
import { gupySourceDefinition } from './gupy';
import { leverSourceDefinition } from './lever';

/**
 * Todas as fontes disponíveis. Para adicionar uma: crie a pasta dela a partir
 * de `src/_template/` e coloque a definição aqui — ver docs/ADDING_A_SOURCE.md.
 *
 * A ordem importa: em vaga duplicada entre fontes, vence a que vem primeiro.
 * Coloque antes as fontes que trazem dados mais completos.
 */
export const SOURCE_DEFINITIONS: readonly SourceDefinition<never>[] = [
  gupySourceDefinition as SourceDefinition<never>,
  greenhouseSourceDefinition as SourceDefinition<never>,
  leverSourceDefinition as SourceDefinition<never>,
  ashbySourceDefinition as SourceDefinition<never>,
];

export interface BuildSourcesResult {
  /** Fontes prontas, na ordem do registro. */
  sources: JobSource[];
  /** Ids pedidos em `enabledIds` que não existem no registro. */
  unknown: string[];
  /** Fontes que não puderam ser criadas (configuração inválida). */
  errors: (UnavailableSourceInfo & { message: string })[];
  /** Fontes com configuração válida mas sem o que fazer (ex.: lista de empresas vazia). */
  inactive: (UnavailableSourceInfo & { reason: string })[];
}

/** Identificação de uma fonte que ficou de fora, para mostrar na API. */
export interface UnavailableSourceInfo {
  sourceId: string;
  displayName: string;
  kind: SourceKind;
}

/**
 * Cria as fontes ativas, cada uma com a própria configuração lida do `env`.
 * Sem `enabledIds` (ou lista vazia), todas. Uma fonte com configuração
 * inválida fica de fora e é reportada em `errors`; uma sem o que fazer
 * (`inactiveReason`), em `inactive` — as outras sobem normalmente.
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
    inactive: [],
  };

  for (const definition of definitions) {
    if (wanted && !wanted.has(definition.id)) {
      continue;
    }

    const info: UnavailableSourceInfo = {
      sourceId: definition.id,
      displayName: definition.displayName,
      kind: definition.kind,
    };

    try {
      const config = definition.parseConfig(env);
      const reason = definition.inactiveReason?.(config) ?? null;
      if (reason) {
        result.inactive.push({ ...info, reason });
        continue;
      }
      result.sources.push(definition.create(config));
    } catch (error) {
      result.errors.push({
        ...info,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
