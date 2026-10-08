export type CheckStatus = 'up' | 'down';

export interface HealthReport {
  status: 'ok' | 'degraded';
  checks: { database: CheckStatus; redis: CheckStatus };
  uptimeSeconds: number;
}

/** 503 também traz o relatório no corpo — só erro de rede vira exceção. */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthReport> {
  const response = await fetch('/api/health', { signal });

  if (!response.ok && response.status !== 503) {
    throw new Error(`API respondeu ${response.status}`);
  }

  return (await response.json()) as HealthReport;
}
