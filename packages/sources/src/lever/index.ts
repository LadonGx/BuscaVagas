import { noCompaniesReason } from '../core/boards/per-company';
import type { SourceDefinition } from '../core/job-source';
import { LEVER_ENV_PREFIX, parseLeverConfig, type LeverConfig } from './lever.config';
import { LEVER_SOURCE_ID } from './lever.mapper';
import { LeverSource } from './lever.source';

/** O módulo do Lever visto de fora — é só isso que o registro importa. */
export const leverSourceDefinition: SourceDefinition<LeverConfig> = {
  id: LEVER_SOURCE_ID,
  displayName: 'Lever',
  kind: 'company-board',
  parseConfig: parseLeverConfig,
  inactiveReason: noCompaniesReason(LEVER_ENV_PREFIX),
  create: (config) => new LeverSource(config),
};

export { LeverSource } from './lever.source';
export { mapLeverPosting } from './lever.mapper';
