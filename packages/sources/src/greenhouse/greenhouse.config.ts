import type { EnvLike } from '../core/job-source';
import { DEFAULT_BOARD_FILTERS } from '../core/boards/filters';
import { parseCompanyBoardConfig, type CompanyBoardConfig } from '../core/boards/per-company';

/**
 * `GREENHOUSE_COMPANIES` (slug[=Nome], vírgula) e `GREENHOUSE_REQUEST_DELAY_MS`,
 * mais os filtros comuns `BOARDS_*`. Ver README.md desta pasta.
 */
export const GREENHOUSE_ENV_PREFIX = 'GREENHOUSE_';

export type GreenhouseConfig = CompanyBoardConfig;

export const DEFAULT_GREENHOUSE_CONFIG: GreenhouseConfig = {
  companies: [],
  requestDelayMs: 300,
  filters: DEFAULT_BOARD_FILTERS,
};

export function parseGreenhouseConfig(env: EnvLike): GreenhouseConfig {
  return parseCompanyBoardConfig(GREENHOUSE_ENV_PREFIX, env);
}
