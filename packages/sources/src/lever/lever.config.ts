import type { EnvLike } from '../core/job-source';
import { DEFAULT_BOARD_FILTERS } from '../core/boards/filters';
import { parseCompanyBoardConfig, type CompanyBoardConfig } from '../core/boards/per-company';

/**
 * `LEVER_COMPANIES` (slug[=Nome], vírgula) e `LEVER_REQUEST_DELAY_MS`,
 * mais os filtros comuns `BOARDS_*`. Ver README.md desta pasta.
 */
export const LEVER_ENV_PREFIX = 'LEVER_';

export type LeverConfig = CompanyBoardConfig;

export const DEFAULT_LEVER_CONFIG: LeverConfig = {
  companies: [],
  requestDelayMs: 300,
  filters: DEFAULT_BOARD_FILTERS,
};

export function parseLeverConfig(env: EnvLike): LeverConfig {
  return parseCompanyBoardConfig(LEVER_ENV_PREFIX, env);
}
