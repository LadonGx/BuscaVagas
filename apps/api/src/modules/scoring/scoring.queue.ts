import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { QUEUES } from '../../queue/queue.constants';
import {
  SCORING_DEBOUNCE_MS,
  SCORING_DEDUP_ID,
  SCORING_JOB_NAME,
  type ScoreRequester,
} from './scoring.constants';

/** `ScoreRequester` de verdade: um job na fila `scoring`, com debounce. */
@Injectable()
export class BullScoreRequester implements ScoreRequester {
  private readonly logger = new Logger('Scoring');

  constructor(@InjectQueue(QUEUES.SCORING) private readonly queue: Queue) {}

  async request(reason: string): Promise<boolean> {
    try {
      await this.queue.add(
        SCORING_JOB_NAME,
        { reason },
        {
          delay: SCORING_DEBOUNCE_MS,
          deduplication: { id: SCORING_DEDUP_ID, ttl: SCORING_DEBOUNCE_MS },
          removeOnComplete: true,
          removeOnFail: { count: 50 },
        },
      );
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Não consegui enfileirar o cálculo das notas (${reason}): ${message}`);
      return false;
    }
  }
}
