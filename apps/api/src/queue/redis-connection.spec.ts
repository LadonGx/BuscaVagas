import { describe, expect, it } from 'vitest';
import { redisConnectionFromUrl } from './redis-connection';

describe('redisConnectionFromUrl', () => {
  it('lê host e porta', () => {
    expect(redisConnectionFromUrl('redis://127.0.0.1:6380')).toEqual({
      host: '127.0.0.1',
      port: 6380,
    });
  });

  it('lê senha, banco e TLS', () => {
    expect(redisConnectionFromUrl('rediss://:s%40nha@cache.local:6390/2')).toEqual({
      host: 'cache.local',
      port: 6390,
      password: 's@nha',
      db: 2,
      tls: {},
    });
  });
});
