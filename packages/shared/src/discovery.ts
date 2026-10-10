import { z } from 'zod';

/**
 * Descoberta de vagas: rodar fontes, histórico de execuções.
 * Plano: docs/features/05-discovery-gupy.md
 */

export const SOURCE_RUN_STATUSES = ['running', 'ok', 'failed'] as const;
export type SourceRunStatus = (typeof SOURCE_RUN_STATUSES)[number];

export const SCAN_TRIGGERS = ['manual', 'schedule'] as const;
export type ScanTrigger = (typeof SCAN_TRIGGERS)[number];

/* ------------------------------------------------------------- entrada */

/** Corpo opcional: `POST /api/discovery/scan` sem corpo = todas as fontes, termos do `.env`. */
export const scanInputSchema = z
  .object({
    /** Ids das fontes. Ausente = todas as ativas. */
    sources: z.array(z.string().trim().min(1).max(50)).min(1).max(20).optional(),
    /** Termos desta busca. Ausente = os do `.env` (DISCOVERY_TERMS). */
    terms: z.array(z.string().trim().min(2).max(60)).min(1).max(20).optional(),
  })
  .default({});
export type ScanInput = z.output<typeof scanInputSchema>;

export const sourceRunsQuerySchema = z.object({
  sourceId: z.string().trim().min(1).max(50).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type SourceRunsQuery = z.output<typeof sourceRunsQuerySchema>;

/* --------------------------------------------------------------- saída */

export interface SourceRunDto {
  id: string;
  sourceId: string;
  status: SourceRunStatus;
  trigger: ScanTrigger;
  terms: string[];
  jobsFound: number;
  jobsNew: number;
  /** Itens fora do formato — um salto aqui indica que o site mudou. */
  dropped: number;
  /** Vagas válidas que os filtros da fonte deixaram de fora (não indica problema). */
  filtered: number;
  durationMs: number | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface SourceInfoDto {
  id: string;
  displayName: string;
  kind: 'search' | 'company-board';
  lastRun: SourceRunDto | null;
}

export interface ScanResultDto {
  /** Jobs colocados na fila agora. */
  queued: { sourceId: string; jobId: string }[];
  /** Fontes que já estavam na fila ou rodando — o pedido repetido foi ignorado. */
  alreadyQueued: string[];
  /** Ids pedidos que não são fontes ativas. */
  unknown: string[];
  terms: string[];
}
