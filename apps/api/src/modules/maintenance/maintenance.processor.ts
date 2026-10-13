import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { QUEUES } from '../../queue/queue.constants';
import { AvailabilityService } from '../jobs/availability.service';
import { AVAILABILITY_JOB_NAME } from './maintenance.constants';
import { RetentionService } from './retention.service';

/** Consome a fila `maintenance`: a retenção e a conferência das salvas, uma vez por dia. */
@Processor(QUEUES.MAINTENANCE, { concurrency: 1 })
export class MaintenanceProcessor extends WorkerHost {
  constructor(
    private readonly retention: RetentionService,
    private readonly availability: AvailabilityService,
  ) {
    super();
  }

  process(job: Job) {
    if (job.name === AVAILABILITY_JOB_NAME) return this.availability.checkSaved();
    return this.retention.run();
  }
}
