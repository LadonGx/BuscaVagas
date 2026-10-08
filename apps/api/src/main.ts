import 'reflect-metadata';
import { Logger, type LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { rejectNonLocal } from './common/security/local-only';
import type { Env } from './config/env';

const LEVELS: LogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  const level = config.get('LOG_LEVEL', { infer: true });
  app.useLogger(LEVELS.slice(0, LEVELS.indexOf(level) + 1));

  // Antes de qualquer rota e do CORS. Ver common/security/local-only.ts.
  app.use((request: Request, response: Response, next: NextFunction) => {
    const rejection = rejectNonLocal({
      host: request.headers.host,
      method: request.method,
      contentType: request.headers['content-type'],
      hasBody:
        Number(request.headers['content-length'] ?? 0) > 0 ||
        'transfer-encoding' in request.headers,
    });

    if (!rejection) {
      next();
      return;
    }

    response
      .status(rejection.status)
      .json({ statusCode: rejection.status, message: rejection.message });
  });

  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.get('WEB_ORIGIN', { infer: true }) });
  app.enableShutdownHooks();

  const host = config.get('API_HOST', { infer: true });
  const port = config.get('API_PORT', { infer: true });
  await app.listen(port, host);

  new Logger('Bootstrap').log(`API em http://${host}:${port}/api`);
}

void bootstrap();
