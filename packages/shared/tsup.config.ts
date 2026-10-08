import { defineConfig } from 'tsup';

// Saída dupla: ESM para o front (Vite) e CommonJS para a API (NestJS).
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  // O tsup gera os .d.ts com uma opção (baseUrl) que o TypeScript 6 marca como
  // obsoleta. O aviso é interno ao tsup, não ao nosso código — silenciado só aqui.
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  sourcemap: true,
  clean: true,
  target: 'es2023',
});
