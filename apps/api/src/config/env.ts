import { z } from 'zod';

const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '::1'] as const;

/**
 * Variáveis de ambiente validadas na subida. Valor faltando ou errado
 * derruba a API com uma mensagem clara, em vez de um erro estranho depois.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // A API não tem autenticação de propósito (app local de uma pessoa). Isso
  // só é seguro porque ela não escuta na rede — por isso o host é restrito.
  API_HOST: z.enum(LOOPBACK_HOSTS).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  WEB_ORIGIN: z.url().default('http://127.0.0.1:5173'),

  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL deve começar com postgresql://'),
  REDIS_URL: z.string().regex(/^rediss?:\/\//, 'REDIS_URL deve começar com redis://'),

  LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log'),
});

export type Env = z.infer<typeof envSchema>;

/** Usado pelo ConfigModule (`validate`). */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuração inválida no .env:\n${issues}\nVeja o .env.example na raiz.`);
  }

  return result.data;
}
