import type { CreateJobInput, JobDto, JobLookupDto } from '@busca-vagas/shared';

/**
 * Conversa com o BuscaVagas na SUA máquina. A extensão só tem permissão para
 * 127.0.0.1 e localhost (manifest.json): não fala com nenhum outro servidor.
 */

/** Modo Docker (8080) e modo dev (API em 3333). */
export const DEFAULT_APP_URLS = ['http://127.0.0.1:8080', 'http://127.0.0.1:3333'] as const;

const TIMEOUT_MS = 2_500;

export class AppError extends Error {}

/** Só endereços desta máquina (a extensão não tem permissão para outros). */
export function normalizeAppUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

async function request<T>(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit = {},
): Promise<{ status: number; body: T }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchFn(url, { ...init, signal: controller.signal });
    const body = (await response.json().catch(() => null)) as T;
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Onde o app está: o endereço salvo e, se não responder, os padrões. Vale
 * qualquer resposta do `/api/health` (503 = de pé, mas sem banco ou fila).
 */
export async function findApp(fetchFn: typeof fetch, saved: string | null): Promise<string | null> {
  const candidates = [...new Set([saved, ...DEFAULT_APP_URLS].filter(Boolean) as string[])];
  for (const base of candidates) {
    try {
      const { body } = await request<{ status?: string }>(fetchFn, `${base}/api/health`);
      if (body && typeof body.status === 'string') return base;
    } catch {
      // Não respondeu: tenta o próximo.
    }
  }
  return null;
}

export async function lookupJob(
  fetchFn: typeof fetch,
  base: string,
  query: { url: string; title?: string; company?: string; location?: string },
): Promise<JobLookupDto> {
  const params = new URLSearchParams(
    Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  const { status, body } = await request<JobLookupDto & { message?: string }>(
    fetchFn,
    `${base}/api/jobs/lookup?${params}`,
  );
  if (status !== 200) throw new AppError(body?.message ?? `O app respondeu ${status}.`);
  return body;
}

export async function createJob(
  fetchFn: typeof fetch,
  base: string,
  input: CreateJobInput,
): Promise<JobDto> {
  const { status, body } = await request<JobDto & { message?: string | string[] }>(
    fetchFn,
    `${base}/api/jobs`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  if (status !== 201) {
    const message = Array.isArray(body?.message) ? body.message.join(' ') : body?.message;
    throw new AppError(message ?? `O app respondeu ${status}.`);
  }
  return body;
}

/** Endereço da vaga no app (dev: a tela fica no Vite, em 5173). */
export function openUrlFor(base: string, jobId: string): string {
  const web = base.endsWith(':3333') ? base.replace(/:3333$/, ':5173') : base;
  return `${web}/vagas?vaga=${encodeURIComponent(jobId)}`;
}
