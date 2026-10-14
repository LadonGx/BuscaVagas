import { describe, expect, it } from 'vitest';
import { notificationSettingsInputSchema, notificationTitle } from './notifications';

describe('avisos', () => {
  it('título no singular e no plural', () => {
    expect(notificationTitle({ jobs: [{} as never] })).toBe('1 vaga nova com nota alta');
    expect(notificationTitle({ jobs: [{}, {}, {}] as never[] })).toBe(
      '3 vagas novas com nota alta',
    );
  });

  it('nota mínima entre 0 (desligado) e 1000, inteira', () => {
    expect(notificationSettingsInputSchema.safeParse({ minScore: 0 }).success).toBe(true);
    expect(notificationSettingsInputSchema.safeParse({ minScore: 1000 }).success).toBe(true);
    expect(notificationSettingsInputSchema.safeParse({ minScore: 850.5 }).success).toBe(false);
    expect(notificationSettingsInputSchema.safeParse({ minScore: -1 }).success).toBe(false);
  });
});
