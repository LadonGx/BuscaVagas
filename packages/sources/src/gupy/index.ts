import type { SourceDefinition } from '../core/job-source';
import { parseGupyConfig, type GupyConfig } from './gupy.config';
import { GUPY_SOURCE_ID } from './gupy.mapper';
import { GupySource } from './gupy.source';

/** O módulo da Gupy visto de fora — é só isso que o registro importa. */
export const gupySourceDefinition: SourceDefinition<GupyConfig> = {
  id: GUPY_SOURCE_ID,
  displayName: 'Gupy',
  kind: 'search',
  parseConfig: parseGupyConfig,
  create: (config) => new GupySource(config),
};

export { GupySource } from './gupy.source';
export { mapGupyJob } from './gupy.mapper';
