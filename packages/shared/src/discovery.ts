import { z } from 'zod';
import { pageQuerySchema } from './common';

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

/** Paginado por cursor, como as outras listagens: `{ items, nextCursor }`. */
export const sourceRunsQuerySchema = pageQuerySchema.extend({
  sourceId: z.string().trim().min(1).max(50).optional(),
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

/**
 * Tipo de fonte: `search` (termos de busca), `company-board` (empresas
 * acompanhadas) ou `mailbox` (alertas que chegam por e-mail —
 * docs/features/20-email-alerts.md).
 */
export type SourceKindDto = 'search' | 'company-board' | 'mailbox';

/**
 * Sites cujas vagas só chegam por alerta de e-mail (o app nunca acessa esses
 * sites). Nome de exibição do `source` dessas vagas.
 */
export const EMAIL_ALERT_SITES = {
  linkedin: 'LinkedIn',
  indeed: 'Indeed',
  glassdoor: 'Glassdoor',
} as const;
export type EmailAlertSite = keyof typeof EMAIL_ALERT_SITES;

export interface SourceInfoDto {
  id: string;
  displayName: string;
  kind: SourceKindDto;
  /**
   * `false` = a fonte existe mas não roda: board sem empresas acompanhadas
   * ou configuração inválida. O motivo vem em `reason`.
   */
  active: boolean;
  reason: string | null;
  /** Boards de empresa: quantas empresas ligadas. `null` nas fontes de busca. */
  trackedCompanies: number | null;
  lastRun: SourceRunDto | null;
  /** Próxima execução agendada. `null` = inativa, sem agenda ou fila fora do ar. */
  nextRunAt: string | null;
  /** Há um job desta fonte esperando ou rodando agora. */
  running: boolean;
}

/** Fonte pedida (ou existente) que não rodou, e por quê. */
export interface InactiveSourceDto {
  sourceId: string;
  reason: string;
}

export interface ScanResultDto {
  /** Jobs colocados na fila agora. */
  queued: { sourceId: string; jobId: string }[];
  /** Fontes que já estavam na fila ou rodando — o pedido repetido foi ignorado. */
  alreadyQueued: string[];
  /**
   * Fontes que existem mas estão desligadas (ex.: `GREENHOUSE_COMPANIES`
   * vazio). Nada foi buscado nelas — o motivo diz o que configurar.
   */
  inactive: InactiveSourceDto[];
  /** Ids pedidos que não existem. */
  unknown: string[];
  terms: string[];
}
