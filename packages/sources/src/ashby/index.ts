import { noCompaniesReason } from '../core/boards/per-company';
import type { SourceDefinition } from '../core/job-source';
import { ASHBY_ENV_PREFIX, parseAshbyConfig, type AshbyConfig } from './ashby.config';
import { ASHBY_SOURCE_ID } from './ashby.mapper';
import { AshbySource } from './ashby.source';

/** O módulo do Ashby visto de fora — é só isso que o registro importa. */
export const ashbySourceDefinition: SourceDefinition<AshbyConfig> = {
  id: ASHBY_SOURCE_ID,
  displayName: 'Ashby',
  kind: 'company-board',
  parseConfig: parseAshbyConfig,
  inactiveReason: noCompaniesReason(ASHBY_ENV_PREFIX),
  create: (config) => new AshbySource(config),
};

export { AshbySource } from './ashby.source';
export { mapAshbyJob } from './ashby.mapper';
