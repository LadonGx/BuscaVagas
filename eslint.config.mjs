import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/generated/**', '**/coverage/**'],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['apps/api/**/*.ts', 'packages/**/*.ts', '*.{js,mjs,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  // Regras dos hooks e do React Compiler (efeitos, refs, estado no render...).
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat['recommended-latest'],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // Por último: desliga regras de estilo que brigariam com o Prettier.
  prettier,
);
