import { z } from 'zod';

const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '::1'] as const;
/** Todas as interfaces: só dentro do container (docs/features/19-docker-app.md). */
const CONTAINER_HOST = '0.0.0.0';

export const DEFAULT_DISCOVERY_TERMS = [
  'desenvolvedor',
  'full stack',
  'backend',
  'frontend',
  'node',
  'react',
];

/** "a, b ,c" -> ["a", "b", "c"]; vazio -> []. */
const csv = z.string().transform((value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
);

/**
 * Variáveis de ambiente validadas na subida. Valor faltando ou errado
 * derruba a API com uma mensagem clara, em vez de um erro estranho depois.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // A API não tem autenticação de propósito (app local de uma pessoa). Isso
    // só é seguro porque ela não escuta na rede — por isso o host é restrito.
    // 0.0.0.0 só com CONTAINER=true (vem do Dockerfile): lá dentro a API precisa
    // ouvir a rede do container, e o compose publica a porta só em 127.0.0.1.
    API_HOST: z.enum([...LOOPBACK_HOSTS, CONTAINER_HOST]).default('127.0.0.1'),
    CONTAINER: z.stringbool().default(false),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3333),
    WEB_ORIGIN: z.url().default('http://127.0.0.1:5173'),

    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL deve começar com postgresql://'),
    REDIS_URL: z.string().regex(/^rediss?:\/\//, 'REDIS_URL deve começar com redis://'),

    LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log'),

    // --- Descoberta de vagas (docs/features/05-discovery-gupy.md) -------------
    /** Fontes ativas; vazio = todas as registradas. */
    DISCOVERY_SOURCES: csv.default([]),
    /** Termos de busca das fontes por termo. Cada termo é uma busca separada. */
    DISCOVERY_TERMS: csv
      .refine((terms) => terms.length > 0, 'Informe ao menos um termo')
      .default(DEFAULT_DISCOVERY_TERMS),
    /** Varredura automática a cada N horas enquanto a API roda. 0 desliga. */
    DISCOVERY_INTERVAL_HOURS: z.coerce.number().int().min(0).max(168).default(6),

    // --- Retenção (docs/features/08-retention.md) ------------------------------
    /** Descartadas e caixa esquecida saem depois de N dias. 0 desliga a limpeza. */
    RETENTION_DAYS: z.coerce.number().int().min(0).max(365).default(30),
    /** Por quanto tempo a URL de uma descartada apagada impede a vaga de voltar. */
    RETENTION_FORGET_DAYS: z.coerce.number().int().min(30).max(3650).default(180),

    // --- Backup (docs/features/18-backup.md) -----------------------------------
    /** Pasta da cópia de segurança feita antes de restaurar (relativa à pasta da API). */
    BACKUP_DIR: z.string().trim().min(1).default('../../backups'),

    // --- Modo Docker (docs/features/19-docker-app.md) --------------------------
    /** Pasta da tela compilada (apps/web/dist). Com ela, a API também serve a tela. */
    WEB_DIST_DIR: z
      .string()
      .trim()
      .optional()
      .transform((value) => value || undefined),
  })
  .refine((env) => env.API_HOST !== CONTAINER_HOST || env.CONTAINER, {
    path: ['API_HOST'],
    message: 'use 127.0.0.1 (0.0.0.0 só dentro do container do docker-compose.app.yml)',
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
