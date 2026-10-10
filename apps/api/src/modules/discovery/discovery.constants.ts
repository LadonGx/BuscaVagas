import type { ScanTrigger } from '@busca-vagas/shared';

/** Token das fontes ativas (`JobSource[]`), já configuradas. */
export const SOURCES = Symbol('SOURCES');

/** Token do cliente HTTP que as fontes usam. */
export const SOURCE_HTTP_CLIENT = Symbol('SOURCE_HTTP_CLIENT');

/** Nome dos jobs na fila `source-scan`. */
export const SCAN_JOB_NAME = 'scan';

/** Dados de um job de varredura: uma fonte, seus termos e quem pediu. */
export interface ScanJobData {
  sourceId: string;
  terms: string[];
  trigger: ScanTrigger;
}

/** Dedup na fila: a mesma fonte não entra duas vezes enquanto espera/roda. */
export const scanDedupId = (sourceId: string) => `scan:${sourceId}`;

/** Id do agendador de uma fonte. */
export const schedulerId = (sourceId: string) => `schedule:${sourceId}`;
