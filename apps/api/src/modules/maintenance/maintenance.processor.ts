import { Processor, WorkerHost } from '@nestjs/bullmq';
import { QUEUES } from '../../queue/queue.constants';
import { RetentionService } from './retention.service';

/** Consome a fila `maintenance`: hoje, só a retenção diária. */
@Processor(QUEUES.MAINTENANCE, { concurrency: 1 })
export class MaintenanceProcessor extends WorkerHost {
  constructor(private readonly retention: RetentionService) {
    super();
  }

  process() {
    return this.retention.run();
  }
}
