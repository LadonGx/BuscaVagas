import type { EnvLike } from '../core/job-source';
import { DEFAULT_BOARD_FILTERS } from '../core/boards/filters';
import { parseCompanyBoardConfig, type CompanyBoardConfig } from '../core/boards/per-company';

/**
 * `ASHBY_COMPANIES` (slug[=Nome], vírgula) e `ASHBY_REQUEST_DELAY_MS`,
 * mais os filtros comuns `BOARDS_*`. Ver README.md desta pasta.
 */
export const ASHBY_ENV_PREFIX = 'ASHBY_';

export type AshbyConfig = CompanyBoardConfig;

export const DEFAULT_ASHBY_CONFIG: AshbyConfig = {
  companies: [],
  requestDelayMs: 300,
  filters: DEFAULT_BOARD_FILTERS,
};

export function parseAshbyConfig(env: EnvLike): AshbyConfig {
  return parseCompanyBoardConfig(ASHBY_ENV_PREFIX, env);
}
