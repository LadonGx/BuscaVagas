/** Nome do job de retenção na fila `maintenance`. */
export const RETENTION_JOB_NAME = 'retention';

/** Id do agendador diário da retenção. */
export const RETENTION_SCHEDULER_ID = 'schedule:retention';

export const RETENTION_EVERY_MS = 24 * 60 * 60 * 1000;

/** Primeira execução agendada: 5 minutos depois de a agenda ser criada. */
export const RETENTION_FIRST_RUN_DELAY_MS = 5 * 60 * 1000;
