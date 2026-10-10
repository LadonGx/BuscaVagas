import type { SourceDefinition } from '../core/job-source';
import { parseTemplateConfig, type TemplateConfig } from './template.config';
import { TEMPLATE_SOURCE_ID } from './template.mapper';
import { TemplateSource } from './template.source';

/** O que o registro (`registry.ts`) importa: a fonte vista de fora. */
export const templateSourceDefinition: SourceDefinition<TemplateConfig> = {
  id: TEMPLATE_SOURCE_ID,
  displayName: 'Exemplo',
  kind: 'search',
  parseConfig: parseTemplateConfig,
  create: (config) => new TemplateSource(config),
};
