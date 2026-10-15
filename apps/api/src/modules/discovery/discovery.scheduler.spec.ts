import { describe, expect, it } from 'vitest';
import { desiredSchedules } from './discovery.scheduler';

describe('desiredSchedules', () => {
  const sources = [{ id: 'gupy' }, { id: 'email', scheduleEveryMs: 60 * 60_000 }];

  it('cada fonte no intervalo dela; o e-mail tem o próprio', () => {
    expect(desiredSchedules(sources, 6, ['react']).map((spec) => [spec.id, spec.everyMs])).toEqual([
      ['schedule:gupy', 6 * 3_600_000],
      ['schedule:email', 3_600_000],
    ]);
  });

  it('DISCOVERY_INTERVAL_HOURS=0 desliga as buscas, não o e-mail', () => {
    expect(desiredSchedules(sources, 0, []).map((spec) => spec.id)).toEqual(['schedule:email']);
  });

  it('EMAIL_INTERVAL_MINUTES=0: e-mail só pelo botão', () => {
    expect(
      desiredSchedules([{ id: 'email', scheduleEveryMs: 0 }], 6, []).map((spec) => spec.id),
    ).toEqual([]);
  });
});
