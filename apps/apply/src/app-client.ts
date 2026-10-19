import type {
  ApplicationDetailDto,
  JobDto,
  JobLookupDto,
  Page,
  ResumeDto,
} from '@busca-vagas/shared';

/** Onde o app costuma estar: modo Docker (8080) e modo dev (3333). */
export const DEFAULT_APP_URLS = ['http://127.0.0.1:8080', 'http://127.0.0.1:3333'];

export class AppError extends Error {}

type FetchFn = typeof fetch;

async function call<T>(
  fetchFn: FetchFn,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<{ status: number; body: T | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 10_000);
  try {
    const response = await fetchFn(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    const text = await response.text();
    const body = text ? (JSON.parse(text) as T) : null;
    if (!response.ok && response.status !== 404) {
      const message = (body as { message?: unknown } | null)?.message;
      throw new AppError(
        typeof message === 'string' ? message : `O app respondeu ${response.status} em ${url}.`,
      );
    }
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/** O primeiro endereço que responde ao `/api/health` (503 = de pé, sem banco). */
export async function findApp(fetchFn: FetchFn, preferred?: string): Promise<string | null> {
  const candidates = [...new Set([preferred, ...DEFAULT_APP_URLS].filter(Boolean) as string[])];
  for (const raw of candidates) {
    const base = raw.replace(/\/+$/, '');
    try {
      const response = await fetchFn(`${base}/api/health`, {
        signal: AbortSignal.timeout(2_000),
      });
      const body = (await response.json()) as { status?: unknown };
      if (typeof body.status === 'string') return base;
    } catch {
      // Não respondeu: tenta o próximo.
    }
  }
  return null;
}

/** As telas: no Docker, o mesmo endereço; no dev, o Vite (5173). */
export function webOrigin(base: string): string {
  const url = new URL(base);
  if (url.port === '3333') url.port = '5173';
  return url.origin;
}

export class AppClient {
  constructor(
    readonly base: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async job(id: string): Promise<JobDto | null> {
    const { status, body } = await call<JobDto>(
      this.fetchFn,
      `${this.base}/api/jobs/${encodeURIComponent(id)}`,
    );
    return status === 404 ? null : body;
  }

  async lookup(url: string): Promise<JobLookupDto> {
    const query = new URLSearchParams({ url });
    const { body } = await call<JobLookupDto>(
      this.fetchFn,
      `${this.base}/api/jobs/lookup?${query}`,
    );
    return body ?? { match: null, job: null, openUrl: null };
  }

  /** As vagas salvas (as mais prováveis de virar candidatura). */
  async savedJobs(): Promise<JobDto[]> {
    const { body } = await call<Page<JobDto>>(
      this.fetchFn,
      `${this.base}/api/jobs?triage=saved&limit=50`,
    );
    return body?.items ?? [];
  }

  async resume(): Promise<ResumeDto> {
    const { body } = await call<ResumeDto>(this.fetchFn, `${this.base}/api/resume`);
    return body ?? { sections: [] };
  }

  async createApplication(jobId: string, appliedVia: string): Promise<ApplicationDetailDto> {
    const { body } = await call<ApplicationDetailDto>(
      this.fetchFn,
      `${this.base}/api/applications`,
      {
        method: 'POST',
        body: JSON.stringify({ jobId, appliedVia }),
      },
    );
    if (!body) throw new AppError('O app não devolveu a candidatura.');
    return body;
  }

  /** Guarda com a candidatura o PDF que foi anexado no formulário. */
  async attachResumeFile(applicationId: string, name: string, content: Buffer): Promise<void> {
    await call(this.fetchFn, `${this.base}/api/applications/${applicationId}/resume-file`, {
      method: 'PUT',
      body: JSON.stringify({ name, contentBase64: content.toString('base64') }),
      timeoutMs: 30_000,
    });
  }
}
