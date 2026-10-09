import { config } from 'dotenv';

config({ path: ['.env', '../../.env'], quiet: true });

/**
 * URL do banco de testes. Ordem:
 *  1. TEST_DATABASE_URL, se definida;
 *  2. senão, a DATABASE_URL com o nome do banco + "_test"
 *     (buscavagas -> buscavagas_test), no mesmo Postgres do Docker.
 *
 * Sem nenhuma das duas, os testes de integração são pulados.
 */
export function resolveTestDatabaseUrl(): string | undefined {
  if (process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL;
  }

  if (!process.env.DATABASE_URL) {
    return undefined;
  }

  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `${url.pathname.replace(/^\//, '')}_test`;
  return url.toString();
}

/**
 * Trava de segurança: o setup apaga o schema inteiro do banco de testes.
 * Só aceita banco cujo nome termina em "_test" — nunca o seu banco de uso.
 */
export function assertTestDatabase(url: string): string {
  const name = new URL(url).pathname.replace(/^\//, '');

  if (!/^[\w-]+_test$/.test(name)) {
    throw new Error(
      `Banco de testes "${name}" recusado: o nome precisa terminar em "_test", ` +
        'porque o setup apaga o conteúdo dele.',
    );
  }

  return name;
}
