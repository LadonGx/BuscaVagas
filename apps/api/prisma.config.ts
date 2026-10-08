import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// O .env fica na raiz do monorepo; o local (apps/api/.env) tem prioridade se existir.
config({ path: ['.env', '../../.env'], quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // process.env, e não o helper env() do Prisma: env() lança sem a variável,
    // e isso quebraria o `prisma generate` do postinstall num clone sem .env.
    url: process.env.DATABASE_URL,
  },
});
