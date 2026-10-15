import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

/**
 * Modo Docker (docs/features/19-docker-app.md): a API também entrega a tela
 * compilada (apps/web/dist), no mesmo endereço. Sem CORS e sem um servidor
 * a mais. No dev isso fica desligado e quem serve a tela é o Vite.
 *
 * - `/assets/*` têm hash no nome: cache de um ano.
 * - Qualquer outra rota sem extensão (`/vagas`, `/candidaturas/123`) recebe o
 *   index.html, e o React Router resolve. `/api/*` nunca cai aqui.
 */
export function serveWeb(app: NestExpressApplication, dir: string): void {
  const root = resolve(process.cwd(), dir);
  const index = join(root, 'index.html');
  if (!existsSync(index)) {
    throw new Error(`WEB_DIST_DIR: não achei ${index}. Compile a tela (pnpm build).`);
  }

  const assets = join(root, 'assets');
  app.useStaticAssets(root, {
    index: false,
    setHeaders: (response: Response, path: string) => {
      response.setHeader(
        'Cache-Control',
        path.startsWith(assets) ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    },
  });

  app.use((request: Request, response: Response, next: NextFunction) => {
    const isPage =
      (request.method === 'GET' || request.method === 'HEAD') &&
      !/^\/api(\/|$)/.test(request.path) &&
      extname(request.path) === '';
    if (!isPage) {
      next();
      return;
    }
    response.setHeader('Cache-Control', 'no-cache');
    response.sendFile(index);
  });
}
