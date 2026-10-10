import { describe, expect, it } from 'vitest';
import { EMPTY_PREFERENCES, isPreferencesConfigured, preferencesInputSchema } from './preferences';

describe('preferências', () => {
  it('{} = neutras (nota desligada)', () => {
    const parsed = preferencesInputSchema.parse({});
    expect(parsed).toEqual(EMPTY_PREFERENCES);
    expect(isPreferencesConfigured(parsed)).toBe(false);
  });

  it('normaliza stacks, tira repetição e a principal vence "ganha pontos"', () => {
    const parsed = preferencesInputSchema.parse({
      stacksCore: ['Node.js', ' React '],
      stacksPlus: ['react', 'Docker', 'docker'],
      seniorities: ['junior', 'junior', 'trainee'],
      cities: ['Campinas', 'Campinas'],
    });
    expect(parsed).toMatchObject({
      stacksCore: ['node.js', 'react'],
      stacksPlus: ['docker'],
      seniorities: ['junior', 'trainee'],
      cities: ['Campinas'],
    });
    expect(isPreferencesConfigured(parsed)).toBe(true);
  });

  it('a mesma stack não pode ser principal e evitada', () => {
    const result = preferencesInputSchema.safeParse({ stacksCore: ['php'], stacksAvoid: ['PHP'] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['stacksAvoid']);
  });

  it('valores fora da faixa e enums desconhecidos são recusados', () => {
    expect(preferencesInputSchema.safeParse({ maxAgeDays: 0 }).success).toBe(false);
    expect(preferencesInputSchema.safeParse({ minMonthlySalary: -1 }).success).toBe(false);
    expect(preferencesInputSchema.safeParse({ workModels: ['marte'] }).success).toBe(false);
  });
});
