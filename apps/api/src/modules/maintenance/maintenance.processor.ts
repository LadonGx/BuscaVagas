import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { QUEUES } from '../../queue/queue.constants';
import { AvailabilityService } from '../jobs/availability.service';
import { AVAILABILITY_JOB_NAME, RECENCY_JOB_NAME } from './maintenance.constants';
import { RecencyRefreshService } from './recency-refresh.service';
import { RetentionService } from './retention.service';

/**
 * Consome a fila `maintenance`: a retenção, a conferência das salvas e a
 * idade das vagas na nota, uma vez por dia.
 */
@Processor(QUEUES.MAINTENANCE, { concurrency: 1 })
export class MaintenanceProcessor extends WorkerHost {
  constructor(
    private readonly retention: RetentionService,
    private readonly availability: AvailabilityService,
    private readonly recency: RecencyRefreshService,
  ) {
    super();
  }

  process(job: Job) {
    if (job.name === AVAILABILITY_JOB_NAME) return this.availability.checkSaved();
    if (job.name === RECENCY_JOB_NAME) return this.recency.run();
    return this.retention.run();
  }
}
