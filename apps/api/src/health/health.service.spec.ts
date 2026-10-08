import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUES } from '../queue/queue.constants';
import { HealthService } from './health.service';

async function build(options: { dbUp: boolean; redisUp: boolean }) {
  const prisma = {
    $queryRaw: vi.fn(() =>
      options.dbUp ? Promise.resolve([{ '?column?': 1 }]) : Promise.reject(new Error('db down')),
    ),
  };
  const queue = {
    count: vi.fn(() =>
      options.redisUp ? Promise.resolve(0) : Promise.reject(new Error('redis down')),
    ),
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      HealthService,
      { provide: PrismaService, useValue: prisma },
      { provide: getQueueToken(QUEUES.SOURCE_SCAN), useValue: queue },
    ],
  }).compile();

  return moduleRef.get(HealthService);
}

describe('HealthService', () => {
  it('ok quando banco e Redis respondem', async () => {
    const service = await build({ dbUp: true, redisUp: true });
    const report = await service.check();

    expect(report.status).toBe('ok');
    expect(report.checks).toEqual({ database: 'up', redis: 'up' });
  });

  it('degraded e aponta quem caiu', async () => {
    const service = await build({ dbUp: true, redisUp: false });
    const report = await service.check();

    expect(report.status).toBe('degraded');
    expect(report.checks).toEqual({ database: 'up', redis: 'down' });
  });
});
