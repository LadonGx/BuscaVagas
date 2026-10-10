import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { Env } from '../../config/env';
import { QUEUES } from '../../queue/queue.constants';
import { planSchedules, type ScheduleSpec } from '../../queue/schedule-plan';
import {
  RETENTION_EVERY_MS,
  RETENTION_FIRST_RUN_DELAY_MS,
  RETENTION_JOB_NAME,
  RETENTION_SCHEDULER_ID,
} from './maintenance.constants';

/**
 * Agenda a retenção uma vez por dia. Mesma regra da descoberta: só mexe no
 * agendador quando a configuração muda, para o modo dev (que reinicia a cada
 * arquivo salvo) não empurrar nem disparar a limpeza.
 */
@Injectable()
export class MaintenanceScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(MaintenanceScheduler.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    @InjectQueue(QUEUES.MAINTENANCE) private readonly queue: Queue,
  ) {}

  onApplicationBootstrap(): void {
    void this.sync().catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Não consegui agendar a limpeza diária: ${reason}`);
    });
  }

  async sync(): Promise<void> {
    const days = this.config.get('RETENTION_DAYS', { infer: true });
    // Os dias vão no `data` só para que mudar RETENTION_DAYS conte como mudança.
    const desired: ScheduleSpec<{ days: number }>[] =
      days > 0 ? [{ id: RETENTION_SCHEDULER_ID, everyMs: RETENTION_EVERY_MS, data: { days } }] : [];

    const existing = (await this.queue.getJobSchedulers(0, -1)).map((scheduler) => ({
      id: scheduler.key,
      everyMs: scheduler.every,
      data: scheduler.template?.data,
    }));

    const plan = planSchedules(existing, desired);

    for (const spec of plan.upsert) {
      await this.queue.upsertJobScheduler(
        spec.id,
        { every: spec.everyMs, startDate: Date.now() + RETENTION_FIRST_RUN_DELAY_MS },
        { name: RETENTION_JOB_NAME, data: spec.data, opts: { removeOnComplete: { count: 30 } } },
      );
    }
    for (const id of plan.remove) {
      await this.queue.removeJobScheduler(id);
    }

    this.logger.log(
      days > 0
        ? `Limpeza diária: descartadas e caixa esquecida há mais de ${days} dias`
        : 'Limpeza diária desligada (RETENTION_DAYS=0)',
    );
  }
}
