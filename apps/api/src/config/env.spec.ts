import { describe, expect, it } from 'vitest';
import { validateEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://u:p@127.0.0.1:5433/db',
  REDIS_URL: 'redis://127.0.0.1:6380',
};

describe('validateEnv', () => {
  it('aplica os padrões', () => {
    const env = validateEnv(base);
    expect(env.API_HOST).toBe('127.0.0.1');
    expect(env.API_PORT).toBe(3333);
  });

  it('converte a porta de string para número', () => {
    expect(validateEnv({ ...base, API_PORT: '4000' }).API_PORT).toBe(4000);
  });

  it('recusa escutar fora da máquina', () => {
    expect(() => validateEnv({ ...base, API_HOST: '0.0.0.0' })).toThrow(/API_HOST/);
  });

  it('explica o que falta', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });
});
