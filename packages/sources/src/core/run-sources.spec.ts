import type { JobPosting } from '@busca-vagas/shared';
import { describe, expect, it } from 'vitest';
import type { HttpClient } from './http';
import type { JobSource } from './job-source';
import { runSources } from './run-sources';

const http: HttpClient = {
  getJson: async () => ({}),
  getText: async () => '',
};

function job(url: string, source: string): JobPosting {
  return {
    source,
    externalId: null,
    url,
    title: 'Dev',
    company: 'Acme',
    description: null,
    location: null,
    workModel: null,
    contractType: null,
    seniority: null,
    stack: [],
    salary: null,
    postedAt: null,
  };
}

function fakeSource(
  id: string,
  behavior: () => Promise<JobPosting[]>,
  timeoutMs?: number,
): JobSource {
  return {
    id,
    displayName: id,
    kind: 'search',
    timeoutMs,
    fetch: async () => ({ jobs: await behavior(), dropped: 0 }),
  };
}

describe('runSources', () => {
  it('isola a fonte que falha e mantém as outras', async () => {
    const result = await runSources(
      [
        fakeSource('ok', async () => [job('https://a.com/1', 'ok')]),
        fakeSource('broken', async () => {
          throw new Error('fora do ar');
        }),
      ],
      {},
      http,
    );

    expect(result.jobs).toHaveLength(1);
    expect(result.outcomes.map((o) => [o.sourceId, o.status])).toEqual([
      ['ok', 'ok'],
      ['broken', 'failed'],
    ]);
    expect(result.outcomes[1]?.error).toBe('fora do ar');
  });

  it('corta a fonte lenta pelo prazo', async () => {
    const slow = fakeSource('slow', () => new Promise(() => {}), 20);
    const result = await runSources([slow], {}, http);

    expect(result.outcomes[0]?.status).toBe('failed');
    expect(result.outcomes[0]?.error).toContain('prazo');
  });

  it('deduplica por URL mantendo a primeira fonte', async () => {
    const result = await runSources(
      [
        fakeSource('first', async () => [job('https://a.com/1', 'first')]),
        fakeSource('second', async () => [job('https://a.com/1', 'second')]),
      ],
      {},
      http,
    );

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.source).toBe('first');
  });
});
