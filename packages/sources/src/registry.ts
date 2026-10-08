import type { JobSource } from './core/job-source';

/**
 * Todas as fontes disponíveis. Para adicionar uma, crie a pasta dela a partir
 * de `src/_template/` e registre a instância aqui — ver docs/ADDING_A_SOURCE.md.
 *
 * A ordem importa: em caso de vaga duplicada entre fontes, vence a que vem
 * primeiro. Coloque antes as fontes que trazem dados mais completos.
 */
export const ALL_SOURCES: readonly JobSource[] = [];

/**
 * Fontes ativas. Sem lista, todas; com lista (vinda do .env), só as citadas.
 * Id desconhecido é ignorado aqui e reportado por quem chamou.
 */
export function selectSources(
  enabledIds?: readonly string[],
  available: readonly JobSource[] = ALL_SOURCES,
): JobSource[] {
  if (!enabledIds || enabledIds.length === 0) {
    return [...available];
  }

  const wanted = new Set(enabledIds);
  return available.filter((source) => wanted.has(source.id));
}
