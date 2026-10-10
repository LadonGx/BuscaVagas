import { describe, expect, it } from 'vitest';
import { buildJobWhere } from './jobs.where';

describe('buildJobWhere', () => {
  const defaultTriage = { triage: { in: ['inbox', 'saved'] } };

  it('sem filtros esconde só as descartadas', () => {
    expect(buildJobWhere({})).toEqual({ AND: [defaultTriage] });
  });

  it('triagem pedida substitui o padrão', () => {
    expect(buildJobWhere({ triage: ['dismissed'] })).toEqual({
      AND: [{ triage: { in: ['dismissed'] } }],
    });
  });

  it('combina filtros com AND e mantém o OR do texto isolado', () => {
    expect(buildJobWhere({ q: 'dev', workModel: ['remote'], stack: ['react'] })).toEqual({
      AND: [
        defaultTriage,
        {
          OR: [
            { title: { contains: 'dev', mode: 'insensitive' } },
            { company: { contains: 'dev', mode: 'insensitive' } },
          ],
        },
        { workModel: { in: ['remote'] } },
        { stack: { hasSome: ['react'] } },
      ],
    });
  });

  it('idade da vaga usa firstSeenAt quando não há postedAt', () => {
    const now = new Date('2026-10-09T12:00:00.000Z');
    const since = new Date('2026-10-02T12:00:00.000Z');

    expect(buildJobWhere({ postedWithinDays: 7 }, now)).toEqual({
      AND: [
        defaultTriage,
        { OR: [{ postedAt: { gte: since } }, { postedAt: null, firstSeenAt: { gte: since } }] },
      ],
    });
  });

  it('nota mínima e esconder incompatíveis', () => {
    expect(buildJobWhere({ minScore: 600, hideIncompatible: true })).toEqual({
      AND: [defaultTriage, { score: { gte: 600 } }, { incompatible: false }],
    });
    expect(buildJobWhere({ hideIncompatible: false })).toEqual({ AND: [defaultTriage] });
  });
});
