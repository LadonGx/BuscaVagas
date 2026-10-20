import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import type { Env } from '../config/env';
import { PrismaExceptionFilter } from './filters/prisma-exception.filter';
import { rejectNonLocal } from './security/local-only';
import { serveWeb } from './serve-web';

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
    });

    if (!rejection) {
      next();
      return;
    }

    response
      .status(rejection.status)
      .json({ statusCode: rejection.status, message: rejection.message });
  });

  // JSON até 15 MB: o PDF enviado numa candidatura vai em base64 (até 10 MB,
  // docs/features/14-resume-versions.md). O padrão do Express é 100 KB.
  (app as NestExpressApplication).useBodyParser('json', { limit: '15mb' });
  // O .zip da restauração vem cru (docs/features/18-backup.md).
  (app as NestExpressApplication).useBodyParser('raw', {
    type: 'application/zip',
    limit: '500mb',
  });

  // Modo Docker: a API também entrega a tela (docs/features/19-docker-app.md).
  const webDist = config.get('WEB_DIST_DIR', { infer: true });
  if (webDist) serveWeb(app as NestExpressApplication, webDist);

  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.get('WEB_ORIGIN', { infer: true }) });
  app.useGlobalFilters(new PrismaExceptionFilter());
}
