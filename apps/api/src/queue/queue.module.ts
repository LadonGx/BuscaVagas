import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { QUEUES } from './queue.constants';
import { redisConnectionFromUrl } from './redis-connection';

/**
 * Conexão com o Redis e registro das filas. Os processadores (workers) moram
 * nos módulos de domínio — ex.: o de `source-scan` em modules/discovery.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: redisConnectionFromUrl(config.get('REDIS_URL', { infer: true })),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: { count: 200 },
          removeOnFail: { count: 500 },
        },
      }),
    }),
    BullModule.registerQueue({ name: QUEUES.SOURCE_SCAN }, { name: QUEUES.SCORING }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
