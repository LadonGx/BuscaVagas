import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import type { Env } from '../config/env';
import { PrismaExceptionFilter } from './filters/prisma-exception.filter';
import { rejectNonLocal } from './security/local-only';

/**
 * Tudo que o app precisa além dos módulos: segurança local, prefixo, CORS e
 * filtros. Fica fora do main.ts para os testes HTTP montarem o app igual à
 * produção — teste com configuração diferente testa outra coisa.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

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
  app.useGlobalFilters(new PrismaExceptionFilter());
}
