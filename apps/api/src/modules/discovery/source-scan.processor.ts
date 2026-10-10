import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { QUEUES } from '../../queue/queue.constants';
import type { ScanJobData } from './discovery.constants';
import { ScanRunner } from './scan-runner.service';

/**
 * Consome a fila `source-scan`. Fino de propósito: toda a lógica está no
 * `ScanRunner`, que é testado sem Redis.
 *
 * Concorrência 2: fontes diferentes rodam em paralelo; a mesma fonte nunca
 * roda duas vezes ao mesmo tempo (dedup na hora de enfileirar).
 * Erro lançado aqui = BullMQ tenta de novo (3x, backoff exponencial — ver
 * QueueModule).
 */
@Processor(QUEUES.SOURCE_SCAN, { concurrency: 2 })
export class SourceScanProcessor extends WorkerHost {
  constructor(private readonly runner: ScanRunner) {
    super();
  }

  async process(job: Job<ScanJobData>) {
    const { sourceId, terms, trigger } = job.data;
    return this.runner.run(sourceId, terms, trigger);
  }
}
