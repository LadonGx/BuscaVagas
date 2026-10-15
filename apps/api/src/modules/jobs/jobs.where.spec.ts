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

  it('fonte: só estas ou todas menos estas', () => {
    expect(buildJobWhere({ source: ['gupy'], excludeSource: ['linkedin', 'indeed'] })).toEqual({
      AND: [
        defaultTriage,
        { source: { in: ['gupy'] } },
        { source: { notIn: ['linkedin', 'indeed'] } },
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

  it('esconder encerradas: poupa salvas e com candidatura', () => {
    const now = new Date('2026-10-09T12:00:00.000Z');
    expect(buildJobWhere({ hideClosed: true }, now)).toEqual({
      AND: [
        defaultTriage,
        {
          OR: [
            { triage: 'saved' },
            { application: { isNot: null } },
            { closedAt: null, deadline: null },
            { closedAt: null, deadline: { gte: now } },
          ],
        },
      ],
    });
    expect(buildJobWhere({ hideClosed: false })).toEqual({ AND: [defaultTriage] });
  });

  it('com candidatura: sem triagem padrão, a não ser que seja pedida', () => {
    expect(buildJobWhere({ hasApplication: true })).toEqual({
      AND: [{ application: { isNot: null } }],
    });
    expect(buildJobWhere({ hasApplication: true, triage: ['saved'] })).toEqual({
      AND: [{ triage: { in: ['saved'] } }, { application: { isNot: null } }],
    });
    expect(buildJobWhere({ hasApplication: false })).toEqual({
      AND: [defaultTriage, { application: { is: null } }],
    });
  });
});
