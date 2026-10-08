/**
 * Nomes das filas. A fila serve para trabalho LENTO ou EXTERNO (rede, IA),
 * não para gravação rápida: salvar vagas no Postgres é um `createMany` de
 * milissegundos e não precisa de fila. Ver docs/ARCHITECTURE.md.
 */
export const QUEUES = {
  /** Um job por fonte: busca, retry com backoff, histórico em SourceRun. */
  SOURCE_SCAN: 'source-scan',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
