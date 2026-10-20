/**
 * Cliente HTTP da API. Tudo passa por aqui: monta a query string, envia JSON
 * e transforma erro em `ApiError` (a API respondeu) ou `ApiOfflineError` (nem
 * respondeu). As telas mostram `error.message`, já em PT-BR.
 */

export interface ValidationIssue {
  path: string;
  message: string;
}

/** A API respondeu com erro (4xx/5xx). */
export class ApiError extends Error {
  readonly status: number;
  readonly issues: ValidationIssue[];
  /** Corpo da resposta, para quem precisa de mais que a mensagem. */
  readonly body: unknown;

  constructor(status: number, message: string, issues: ValidationIssue[] = [], body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.issues = issues;
    this.body = body;
  }
}

/** A API não respondeu: fora do ar, porta errada, rede. */
export class ApiOfflineError extends Error {
  constructor() {
    super('A API não respondeu. Ela está rodando? Rode `pnpm dev:api` na pasta do projeto.');
    this.name = 'ApiOfflineError';
  }
}

type QueryValue = string | number | boolean | null | undefined | readonly (string | number)[];
export type Query = Record<string, QueryValue>;

/** Ausente, `null`, vazio e lista vazia ficam de fora; listas viram "a,b". */
export function toQueryString(query: Query = {}): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(','));
      continue;
    }
    params.set(key, String(value));
  }

  const text = params.toString();
  return text ? `?${text}` : '';
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Query;
  body?: unknown;
  /**
   * Arquivo enviado cru, com o próprio Content-Type (ex.: o .zip do backup,
   * `application/zip` — o único tipo além de JSON que a API aceita na escrita).
   */
  file?: { data: Blob; type: string };
  signal?: AbortSignal;
}

const STATUS_MESSAGES: Record<number, string> = {
  404: 'Não encontrado.',
  409: 'Conflito com um registro que já existe.',
  500: 'Erro interno na API. Veja o terminal do `pnpm dev:api`.',
  503: 'A API está no ar, mas o banco ou a fila não.',
};

/** Mensagem do corpo de erro do NestJS (`message` texto ou lista). */
function messageFrom(status: number, body: unknown): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const { message } = body as { message: unknown };
    if (typeof message === 'string' && message) return message;
    if (Array.isArray(message) && message.length > 0) return message.join(' ');
  }
  return STATUS_MESSAGES[status] ?? `A API respondeu ${status}.`;
}

/** Corpo que não é JSON (ex.: página de erro em texto) vira `undefined`. */
function parseBody(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', query, body, file, signal } = options;
  const init: RequestInit = { method, signal };

  if (file) {
    init.body = file.data;
    init.headers = { 'Content-Type': file.type };
  } else {
    if (body !== undefined) init.body = JSON.stringify(body);
    // Escrita sempre com Content-Type: application/json, mesmo sem corpo: a API
    // recusa as outras (proteção contra POST "simples" de outro site — CSRF).
    if (body !== undefined || method !== 'GET') {
      init.headers = { 'Content-Type': 'application/json' };
    }
  }

  let response: Response;
  try {
    response = await fetch(`/api${path}${toQueryString(query)}`, init);
  } catch (error) {
    // Cancelamento (troca de tela) não é API fora do ar.
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiOfflineError();
  }

  // O proxy do Vite responde 502/504 quando a API não está rodando.
  if (response.status === 502 || response.status === 504) {
    throw new ApiOfflineError();
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const data = parseBody(await response.text());

  if (!response.ok) {
    const issues =
      data && typeof data === 'object' && 'issues' in data && Array.isArray(data.issues)
        ? (data.issues as ValidationIssue[])
        : [];
    throw new ApiError(response.status, messageFrom(response.status, data), issues, data);
  }

  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) =>
    apiRequest<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
  delete: <T = void>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, data: Blob, type: string) =>
    apiRequest<T>(path, { method: 'POST', file: { data, type } }),
};
