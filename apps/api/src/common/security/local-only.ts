/**
 * Barreiras na frente de uma API sem autenticação.
 *
 * Escutar só em 127.0.0.1 não basta: um site aberto no seu navegador consegue
 * mandar requisições para 127.0.0.1 e, com DNS rebinding, ler as respostas.
 *
 *  1. Host: só aceita 127.0.0.1 / localhost / [::1]. Bloqueia DNS rebinding.
 *  2. Escrita (POST/PUT/PATCH/DELETE) só com Content-Type: application/json
 *     (ou application/zip, a restauração do backup — docs/features/18-backup.md),
 *     COM ou SEM corpo. Um POST "simples" de outro site (text/plain, form —
 *     até um <form method=POST> sem campos) chega e executa sem preflight;
 *     exigir um tipo que não é "simples" força o navegador a perguntar antes,
 *     e o CORS recusa. Por isso a regra não olha se há corpo: muitas rotas
 *     (ex.: POST /api/discovery/scan) agem sem receber nada.
 *
 * Função pura, aplicada por middleware no main.ts — é aqui que um erro
 * abriria a API, então é aqui que fica o teste.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
/** Tipos que não são "simples" (pedem preflight) e que a API aceita para escrever. */
const WRITE_TYPES = /^application\/(json|zip)\b/i;

export interface Rejection {
  status: 403 | 415;
  message: string;
}

export function isLoopbackHost(host: string | undefined): boolean {
  if (!host) {
    return false;
  }

  // Remove a porta: "127.0.0.1:3333" -> "127.0.0.1", "[::1]:3333" -> "[::1]".
  const hostname = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0];

  return LOOPBACK.has((hostname ?? '').toLowerCase());
}

export function rejectNonLocal(request: {
  host: string | undefined;
  method: string;
  contentType: string | undefined;
}): Rejection | null {
  if (!isLoopbackHost(request.host)) {
    return {
      status: 403,
      message: 'Esta API só atende requisições para 127.0.0.1 ou localhost.',
    };
  }

  const isWrite = !SAFE_METHODS.has(request.method.toUpperCase());

  if (isWrite && !WRITE_TYPES.test(request.contentType ?? '')) {
    return {
      status: 415,
      message: 'Envie Content-Type: application/json.',
    };
  }

  return null;
}
