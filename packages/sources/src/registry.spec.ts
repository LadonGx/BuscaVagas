import { describe, expect, it } from 'vitest';
import type { JobSource } from './core/job-source';
import { selectSources } from './registry';

const make = (id: string): JobSource => ({
  id,
  displayName: id,
  kind: 'search',
  fetch: async () => ({ jobs: [], dropped: 0 }),
});

describe('selectSources', () => {
  const available = [make('gupy'), make('greenhouse'), make('lever')];

  it('sem lista, devolve todas', () => {
    expect(selectSources(undefined, available)).toHaveLength(3);
  });

  it('com lista, devolve só as citadas, na ordem do registro', () => {
    expect(selectSources(['lever', 'gupy'], available).map((s) => s.id)).toEqual(['gupy', 'lever']);
  });
});
