const DAY_MS = 24 * 60 * 60 * 1000;

/** Nome do job de retenção na fila `maintenance`. */
export const RETENTION_JOB_NAME = 'retention';

/** Id do agendador diário da retenção. */
export const RETENTION_SCHEDULER_ID = 'schedule:retention';

export const RETENTION_EVERY_MS = DAY_MS;

/** Primeira execução agendada: 5 minutos depois de a agenda ser criada. */
export const RETENTION_FIRST_RUN_DELAY_MS = 5 * 60 * 1000;

/** Conferência diária das vagas salvas (docs/features/13-availability.md). */
export const AVAILABILITY_JOB_NAME = 'availability';

export const AVAILABILITY_SCHEDULER_ID = 'schedule:availability';

export const AVAILABILITY_EVERY_MS = DAY_MS;

/** Primeira conferência: 10 minutos depois de a agenda ser criada. */
export const AVAILABILITY_FIRST_RUN_DELAY_MS = 10 * 60 * 1000;

/** Recalcular a idade das vagas na nota (`RecencyRefreshService`). */
export const RECENCY_JOB_NAME = 'recency';
export const RECENCY_SCHEDULER_ID = 'schedule:recency';
export const RECENCY_EVERY_MS = DAY_MS;
/** Primeira execução: 15 minutos depois de a agenda ser criada. */
export const RECENCY_FIRST_RUN_DELAY_MS = 15 * 60 * 1000;
