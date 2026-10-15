import { z } from 'zod';
import { parseSourceEnv, type EnvLike } from '../core/job-source';

/**
 * Configuração dos alertas por e-mail, lida do `.env` com o prefixo `EMAIL_`.
 * Usuário e senha são SEUS e ficam só no `.env` (fora do git). Para o Gmail,
 * a senha é uma "senha de app" (docs/features/20-email-alerts.md).
 */
export const EMAIL_ENV_PREFIX = 'EMAIL_';

export const emailConfigSchema = z.object({
  IMAP_HOST: z.string().trim().min(1).default('imap.gmail.com'),
  IMAP_PORT: z.coerce.number().int().min(1).max(65535).default(993),
  USER: z.string().trim().optional(),
  PASSWORD: z.string().optional(),
  /** Marcador (pasta) onde o filtro põe os alertas. */
  FOLDER: z.string().trim().min(1).default('BuscaVagas'),
  /** Quantos dias para trás ler a cada vez. */
  LOOKBACK_DAYS: z.coerce.number().int().min(1).max(30).default(3),
  /** Vaga publicada há mais que isso (pela idade que o alerta mostra) não entra. 0 = sem limite. */
  MAX_AGE_DAYS: z.coerce.number().int().min(0).max(365).default(30),
  /** Conferência automática a cada N minutos. 0 = só pelo "Buscar agora". */
  INTERVAL_MINUTES: z.coerce
    .number()
    .int()
    .refine((value) => value === 0 || (value >= 15 && value <= 1440), 'use 0 ou de 15 a 1440')
    .default(60),
});

export interface EmailConfig {
  host: string;
  port: number;
  user: string | null;
  password: string | null;
  folder: string;
  lookbackDays: number;
  intervalMinutes: number;
  maxAgeDays: number;
}

export function parseEmailConfig(env: EnvLike): EmailConfig {
  const raw = parseSourceEnv(EMAIL_ENV_PREFIX, emailConfigSchema, env);
  const host = raw.IMAP_HOST.toLowerCase();
  // O Gmail mostra a senha de app em blocos ("abcd efgh ijkl mnop"); os
  // espaços não fazem parte dela.
  const password =
    host === 'imap.gmail.com' ? (raw.PASSWORD?.replace(/\s+/g, '') ?? '') : (raw.PASSWORD ?? '');
  return {
    host,
    port: raw.IMAP_PORT,
    user: raw.USER || null,
    password: password || null,
    folder: raw.FOLDER,
    lookbackDays: raw.LOOKBACK_DAYS,
    intervalMinutes: raw.INTERVAL_MINUTES,
    maxAgeDays: raw.MAX_AGE_DAYS,
  };
}

export function emailInactiveReason(config: EmailConfig): string | null {
  return config.user && config.password
    ? null
    : 'Configure EMAIL_USER e EMAIL_PASSWORD no .env (no Gmail, uma senha de app). Passo a passo em docs/features/20-email-alerts.md.';
}
