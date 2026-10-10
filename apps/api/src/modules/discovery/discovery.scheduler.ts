import type { JobSource } from '@busca-vagas/sources';
import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { Env } from '../../config/env';
import { QUEUES } from '../../queue/queue.constants';
import { SCAN_JOB_NAME, schedulerId, SOURCES, type ScanJobData } from './discovery.constants';
import { planSchedules, type ScheduleSpec } from '../../queue/schedule-plan';

const HOUR_MS = 60 * 60 * 1000;

/** Primeira execução agendada: 1 minuto depois de a agenda ser criada. */
const FIRST_RUN_DELAY_MS = 60 * 1000;

/**
 * Varredura automática a cada `DISCOVERY_INTERVAL_HOURS` horas, enquanto a
 * API estiver rodando. Usa os agendadores do BullMQ, que ficam no Redis.
 *
 * Na subida, compara a agenda que existe com a configuração e só mexe no que
 * mudou (ver `planSchedules`). Roda em segundo plano: Redis fora do ar não
 * impede a API de subir.
 */
@Injectable()
export class DiscoveryScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(DiscoveryScheduler.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    @Inject(SOURCES) private readonly sources: JobSource[],
    @InjectQueue(QUEUES.SOURCE_SCAN) private readonly queue: Queue<ScanJobData>,
  ) {}

  onApplicationBootstrap(): void {
    void this.sync().catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Não consegui configurar a varredura automática: ${reason}`);
    });
  }

  async sync(): Promise<{ upserted: string[]; removed: string[] }> {
    const hours = this.config.get('DISCOVERY_INTERVAL_HOURS', { infer: true });
    const terms = this.config.get('DISCOVERY_TERMS', { infer: true });

    const desired: ScheduleSpec<ScanJobData>[] =
      hours > 0
        ? this.sources.map((source) => ({
            id: schedulerId(source.id),
            everyMs: hours * HOUR_MS,
            data: { sourceId: source.id, terms, trigger: 'schedule' },
          }))
        : [];

    const existing = (await this.queue.getJobSchedulers(0, -1)).map((scheduler) => ({
      id: scheduler.key,
      everyMs: scheduler.every,
      data: scheduler.template?.data,
    }));

    const plan = planSchedules(existing, desired);

    for (const spec of plan.upsert) {
      await this.queue.upsertJobScheduler(
        spec.id,
        { every: spec.everyMs, startDate: Date.now() + FIRST_RUN_DELAY_MS },
        { name: SCAN_JOB_NAME, data: spec.data },
      );
    }
    for (const id of plan.remove) {
      await this.queue.removeJobScheduler(id);
    }

    const upserted = plan.upsert.map((spec) => spec.id);
    if (upserted.length || plan.remove.length) {
      this.logger.log(
        `Agenda atualizada — criadas/alteradas: [${upserted.join(', ')}], removidas: [${plan.remove.join(', ')}]`,
      );
    }
    this.logger.log(
      hours > 0
        ? `Varredura automática a cada ${hours}h: ${this.sources.map((s) => s.id).join(', ') || '(nenhuma fonte)'}`
        : 'Varredura automática desligada (DISCOVERY_INTERVAL_HOURS=0)',
    );

    return { upserted, removed: plan.remove };
  }
}
