import { z } from 'zod';
import { parseSourceEnv, type EnvLike } from '../core/job-source';

/**
 * Configuração da fonte, lida do `.env` com o prefixo dela. As chaves do
 * schema são os nomes SEM prefixo: `MAX_PAGES` aqui é `TEMPLATE_MAX_PAGES` no
 * `.env`. Todo campo tem padrão: a fonte funciona sem configurar nada.
 */
export const TEMPLATE_ENV_PREFIX = 'TEMPLATE_';

export const templateConfigSchema = z.object({
  MAX_PAGES: z.coerce.number().int().min(1).max(10).default(3),
});

export interface TemplateConfig {
  maxPages: number;
}

export function parseTemplateConfig(env: EnvLike): TemplateConfig {
  const raw = parseSourceEnv(TEMPLATE_ENV_PREFIX, templateConfigSchema, env);
  return { maxPages: raw.MAX_PAGES };
}
