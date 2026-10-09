import type { INestApplication, ModuleMetadata } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe } from 'vitest';
import { configureApp } from '../src/common/configure-app';
import { validateEnv } from '../src/config/env';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { resolveTestDatabaseUrl } from './test-env';

const TEST_DATABASE_URL = resolveTestDatabaseUrl();

/** `describe` que só roda com banco de testes disponível. */
export const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  /** Servidor HTTP para o supertest. */
  http: ReturnType<INestApplication['getHttpServer']>;
  close: () => Promise<void>;
}

/**
 * Sobe um app Nest com os módulos pedidos, o banco de testes e a mesma
 * configuração do main.ts (filtros, prefixo /api, segurança local).
 * Não inclui Redis/fila: os módulos testados aqui não dependem dela.
 */
export async function createTestApp(imports: ModuleMetadata['imports'] = []): Promise<TestApp> {
  if (!TEST_DATABASE_URL) {
    throw new Error('Banco de testes indisponível — use describeDb.');
  }

  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        validate: () =>
          validateEnv({
            DATABASE_URL: TEST_DATABASE_URL,
            REDIS_URL: 'redis://127.0.0.1:6379',
            NODE_ENV: 'test',
          }),
      }),
      PrismaModule,
      ...(imports ?? []),
    ],
  }).compile();

  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();

  const prisma = app.get(PrismaService);

  return {
    app,
    prisma,
    http: app.getHttpServer(),
    close: () => app.close(),
  };
}

/** Esvazia todas as tabelas entre testes. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;

  if (tables.length === 0) {
    return;
  }

  const list = tables.map(({ tablename }) => `"public"."${tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
