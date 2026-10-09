import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { assertTestDatabase, resolveTestDatabaseUrl } from './test-env';

// O Vitest roda a partir de apps/api.
const MIGRATIONS_DIR = join(process.cwd(), 'prisma', 'migrations');

/**
 * Prepara o banco de testes uma vez por rodada:
 *  1. cria o banco se não existir;
 *  2. zera o schema `public`;
 *  3. aplica cada `migration.sql` em ordem.
 *
 * Lê os .sql direto, sem o CLI do Prisma: o teste roda as MESMAS migrations
 * que vão para produção, e não depende do binário do schema engine.
 */
export default async function setup(): Promise<void> {
  const url = resolveTestDatabaseUrl();

  if (!url) {
    console.warn(
      '\n[testes] Sem DATABASE_URL/TEST_DATABASE_URL: testes de integração serão pulados.\n',
    );
    return;
  }

  const dbName = assertTestDatabase(url);

  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await admin.end();
  }

  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    await db.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');

    const migrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    for (const name of migrations) {
      await db.query(readFileSync(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8'));
    }
  } finally {
    await db.end();
  }
}
