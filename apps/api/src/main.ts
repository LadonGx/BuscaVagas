import 'reflect-metadata';
import { Logger, type LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './common/configure-app';
import type { Env } from './config/env';

const LEVELS: LogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  const level = config.get('LOG_LEVEL', { infer: true });
  app.useLogger(LEVELS.slice(0, LEVELS.indexOf(level) + 1));

  configureApp(app);
  app.enableShutdownHooks();

  const host = config.get('API_HOST', { infer: true });
  const port = config.get('API_PORT', { infer: true });
  await app.listen(port, host);

  new Logger('Bootstrap').log(`API em http://${host}:${port}/api`);
}

void bootstrap();
