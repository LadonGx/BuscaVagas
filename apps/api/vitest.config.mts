import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// O SWC emite os metadados de decorator que o NestJS usa para injeção de
// dependência — o transform padrão do Vitest (esbuild/oxc) não emite.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    // Prepara o banco de testes (cria, zera, aplica as migrations).
    globalSetup: ['./test/global-setup.ts'],
    // Os testes de integração dividem o mesmo banco: um arquivo por vez.
    fileParallelism: false,
  },
});
