import { z } from 'zod';
import { parseSourceEnv, type EnvLike } from '../core/job-source';

/**
 * Configuração da Gupy, lida do `.env` com o prefixo `GUPY_`.
 * Tudo tem padrão: a fonte funciona sem configurar nada.
 */
export const GUPY_ENV_PREFIX = 'GUPY_';

export const gupyConfigSchema = z.object({
  /** Páginas de 100 vagas por termo. 3 = até 300 vagas por termo. */
  MAX_PAGES: z.coerce.number().int().min(1).max(20).default(3),
  /** Pausa entre requisições. Volume baixo e ritmo humano. */
  REQUEST_DELAY_MS: z.coerce.number().int().min(0).max(10_000).default(300),
});

export interface GupyConfig {
  maxPages: number;
  requestDelayMs: number;
}

export const DEFAULT_GUPY_CONFIG: GupyConfig = { maxPages: 3, requestDelayMs: 300 };

export function parseGupyConfig(env: EnvLike): GupyConfig {
  const raw = parseSourceEnv(GUPY_ENV_PREFIX, gupyConfigSchema, env);
  return { maxPages: raw.MAX_PAGES, requestDelayMs: raw.REQUEST_DELAY_MS };
}
