import { noCompaniesReason } from '../core/boards/per-company';
import type { SourceDefinition } from '../core/job-source';
import {
  GREENHOUSE_ENV_PREFIX,
  parseGreenhouseConfig,
  type GreenhouseConfig,
} from './greenhouse.config';
import { GREENHOUSE_SOURCE_ID } from './greenhouse.mapper';
import { GreenhouseSource } from './greenhouse.source';

/** O módulo do Greenhouse visto de fora — é só isso que o registro importa. */
export const greenhouseSourceDefinition: SourceDefinition<GreenhouseConfig> = {
  id: GREENHOUSE_SOURCE_ID,
  displayName: 'Greenhouse',
  kind: 'company-board',
  parseConfig: parseGreenhouseConfig,
  inactiveReason: noCompaniesReason(GREENHOUSE_ENV_PREFIX),
  create: (config) => new GreenhouseSource(config),
};

export { GreenhouseSource } from './greenhouse.source';
export { mapGreenhouseJob } from './greenhouse.mapper';
