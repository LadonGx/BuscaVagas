import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseSourceEnv, type SourceDefinition } from './core/job-source';
import { buildSources, SOURCE_DEFINITIONS } from './registry';

function definition(id: string): SourceDefinition<never> {
  return {
    id,
    displayName: id,
    kind: 'search',
    parseConfig: ((env: Record<string, string | undefined>) =>
      parseSourceEnv(
        `${id.toUpperCase()}_`,
        z.object({ PAGES: z.coerce.number().int().max(5).default(1) }),
        env,
      )) as never,
    create: () => ({
      id,
      displayName: id,
      kind: 'search',
      fetch: async () => ({ jobs: [], dropped: 0 }),
    }),
  };
}

describe('buildSources', () => {
  const available = [definition('alpha'), definition('beta'), definition('gama')];

  it('sem lista, cria todas na ordem do registro', () => {
    const result = buildSources({}, undefined, available);
    expect(result.sources.map((s) => s.id)).toEqual(['alpha', 'beta', 'gama']);
    expect(result).toMatchObject({ unknown: [], errors: [] });
  });

  it('com lista, só as citadas; ids desconhecidos são reportados', () => {
    const result = buildSources({}, ['gama', 'alpha', 'linkedin'], available);
    expect(result.sources.map((s) => s.id)).toEqual(['alpha', 'gama']);
    expect(result.unknown).toEqual(['linkedin']);
  });

  it('config inválida tira só aquela fonte e explica o motivo', () => {
    const result = buildSources({ BETA_PAGES: '99' }, undefined, available);
    expect(result.sources.map((s) => s.id)).toEqual(['alpha', 'gama']);
    expect(result.errors[0]).toMatchObject({ sourceId: 'beta' });
    expect(result.errors[0]?.message).toContain('BETA_PAGES');
  });

  it('o registro real tem a Gupy', () => {
    expect(SOURCE_DEFINITIONS.map((d) => d.id)).toContain('gupy');
  });
});
