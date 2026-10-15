import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateEnv } from '../config/env';
import { configureApp } from './configure-app';

@Controller('ping')
class PingController {
  @Get()
  ping() {
    return { ok: true };
  }
}

async function createApp(env: Record<string, string>): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        validate: () =>
          validateEnv({
            DATABASE_URL: 'postgresql://u:p@127.0.0.1:5433/db',
            REDIS_URL: 'redis://127.0.0.1:6380',
            ...env,
          }),
      }),
    ],
    controllers: [PingController],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  return app;
}

describe('serveWeb (modo Docker)', () => {
  let dir: string;
  let app: INestApplication;
  const get = (path: string) => request(app.getHttpServer()).get(path).set('Host', '127.0.0.1');

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'busca-vagas-web-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><div id="root"></div>');
    writeFileSync(join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
    writeFileSync(join(dir, 'favicon.svg'), '<svg/>');
    app = await createApp({ WEB_DIST_DIR: dir });
  });

  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('a raiz e as rotas da tela recebem o index.html, sem cache', async () => {
    for (const path of ['/', '/vagas', '/candidaturas/abc', '/entrevistas/treino?x=1']) {
      const response = await get(path).expect(200);
      expect(response.headers['content-type']).toMatch(/text\/html/);
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.text).toContain('id="root"');
    }
  });

  it('arquivos com hash ficam em cache; os outros não', async () => {
    const asset = await get('/assets/app-abc123.js').expect(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    const icon = await get('/favicon.svg').expect(200);
    expect(icon.headers['cache-control']).toBe('no-cache');
  });

  it('/api continua sendo a API; arquivo que não existe é 404, não a tela', async () => {
    expect((await get('/api/ping').expect(200)).body).toEqual({ ok: true });
    const missing = await get('/api/nao-existe').expect(404);
    expect(missing.headers['content-type']).toMatch(/json/);
    await get('/assets/sumiu.js').expect(404);
  });

  it('a tela também passa pela barreira de Host', async () => {
    await request(app.getHttpServer()).get('/vagas').set('Host', 'evil.com').expect(403);
  });

  it('sem o index.html a API não sobe (erro claro)', async () => {
    await expect(createApp({ WEB_DIST_DIR: join(dir, 'assets') })).rejects.toThrow(
      /WEB_DIST_DIR: não achei/,
    );
  });

  it('sem WEB_DIST_DIR (dev) a API não serve a tela', async () => {
    // O ConfigModule copia o .env validado para process.env; limpa o do teste acima.
    delete process.env.WEB_DIST_DIR;
    const dev = await createApp({});
    await request(dev.getHttpServer()).get('/vagas').set('Host', '127.0.0.1').expect(404);
    await dev.close();
  });
});
