import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// A extensão é um site estático: popup.html + o manifest e os ícones (public/).
// `dist/` é a pasta que você carrega em chrome://extensions.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
    rollupOptions: { input: { popup: resolve(import.meta.dirname, 'popup.html') } },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    restoreMocks: true,
  },
});
