import type { JobPosting } from '@busca-vagas/shared';
import { z } from 'zod';
import { parseSourceEnv, type EnvLike } from '../job-source';
import { classifyPlace, type PlaceClass, type PlaceInfo } from './place';
import { createTitleMatcher, DEFAULT_TITLE_EXCLUDE, DEFAULT_TITLE_KEYWORDS } from './title-filter';

/**
 * Filtros comuns a todos os boards de empresa, lidos do `.env` com o
 * prefixo `BOARDS_`. Ver docs/features/06-company-boards.md.
 */
export const BOARDS_ENV_PREFIX = 'BOARDS_';

export const LOCATION_POLICIES = ['br-remote', 'br', 'any'] as const;
export type LocationPolicy = (typeof LOCATION_POLICIES)[number];

export interface BoardFilters {
  titleKeywords: readonly string[];
  titleExclude: readonly string[];
  location: LocationPolicy;
}

export const DEFAULT_BOARD_FILTERS: BoardFilters = {
  titleKeywords: DEFAULT_TITLE_KEYWORDS,
  titleExclude: DEFAULT_TITLE_EXCLUDE,
  location: 'br-remote',
};

const csv = z.string().transform((value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
);

const boardsEnvSchema = z.object({
  /** Substitui a lista padrão de palavras de tecnologia. */
  TITLE_KEYWORDS: csv.optional(),
  /** Substitui a lista padrão de exclusões. */
  TITLE_EXCLUDE: csv.optional(),
  LOCATION: z.enum(LOCATION_POLICIES).default('br-remote'),
});

export function parseBoardFilters(env: EnvLike): BoardFilters {
  const raw = parseSourceEnv(BOARDS_ENV_PREFIX, boardsEnvSchema, env);
  return {
    titleKeywords: raw.TITLE_KEYWORDS?.length ? raw.TITLE_KEYWORDS : DEFAULT_TITLE_KEYWORDS,
    titleExclude: raw.TITLE_EXCLUDE ?? DEFAULT_TITLE_EXCLUDE,
    location: raw.LOCATION,
  };
}

/** O que o mapper de um board devolve: a vaga + o que o filtro de local precisa. */
export interface BoardItem {
  posting: JobPosting;
  place: PlaceInfo;
}

const KEEP: Record<LocationPolicy, readonly PlaceClass[]> = {
  'br-remote': ['brazil', 'remote-open', 'unknown'],
  br: ['brazil', 'unknown'],
  any: ['brazil', 'remote-open', 'unknown', 'foreign'],
};

/** `true` = a vaga passa nos filtros. */
export function createBoardFilter(filters: BoardFilters): (item: BoardItem) => boolean {
  const isTech = createTitleMatcher(filters.titleKeywords, filters.titleExclude);
  const keep = new Set(KEEP[filters.location]);

  return (item) => isTech(item.posting.title) && keep.has(classifyPlace(item.place));
}
