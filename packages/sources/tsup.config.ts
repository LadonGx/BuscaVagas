import { defineConfig } from 'tsup';

// Só o index entra no pacote. A pasta `_template` é exemplo e fica de fora,
// porque nada no index a importa.
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
