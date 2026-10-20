import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { QUEUES } from '../../queue/queue.constants';
import type { ScanJobData } from './discovery.constants';
import { ScanRunner } from './scan-runner.service';

/**
 * Consome a fila `source-scan`. Fino de propósito: toda a lógica está no
 * `ScanRunner`, que é testado sem Redis.
 *
 * Concorrência 2: fontes diferentes rodam em paralelo; a mesma fonte nunca
 * roda duas vezes ao mesmo tempo. O dedup na hora de enfileirar só cobre o
 * botão (o agendador do BullMQ cria os jobs dele sem dedup), então a trava
 * fica aqui: se a fonte já está rodando, o job é pulado (`null`, como "nada
 * a fazer") — a busca em andamento já traz as vagas. A trava é em memória:
 * o app é local e um processo só consome a fila.
 *
 * Erro lançado aqui = BullMQ tenta de novo (3x, backoff exponencial — ver
 * QueueModule).
 */
@Processor(QUEUES.SOURCE_SCAN, { concurrency: 2 })
export class SourceScanProcessor extends WorkerHost {
  private readonly logger = new Logger(SourceScanProcessor.name);
  /** Fontes com uma busca em andamento neste processo. */
  private readonly running = new Set<string>();

  constructor(private readonly runner: ScanRunner) {
    super();
  }

  async process(job: Job<ScanJobData>) {
    const { sourceId, terms, trigger } = job.data;

    if (this.running.has(sourceId)) {
      this.logger.log(`${sourceId}: já tem uma busca em andamento — pulando (${trigger}).`);
      return null;
    }

    this.running.add(sourceId);
    try {
      return await this.runner.run(sourceId, terms, trigger);
    } finally {
      this.running.delete(sourceId);
    }
  }
}
