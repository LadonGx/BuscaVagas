import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { QUEUES } from '../../queue/queue.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { ScoringService } from './scoring.service';

/**
 * Consome a fila `scoring`. Um job por vez: nota é trabalho de fundo, de
 * baixa prioridade, e não disputa espaço com a busca de vagas (fila própria).
 */
@Processor(QUEUES.SCORING, { concurrency: 1 })
export class ScoringProcessor extends WorkerHost {
  private readonly logger = new Logger(ScoringProcessor.name);

  constructor(
    private readonly scoring: ScoringService,
    private readonly notifications: NotificationsService,
  ) {
    super();
  }

  /** Calcula as notas e, com elas prontas, junta as novas de nota alta num aviso (16). */
  async process() {
    const result = await this.scoring.scoreStale();
    await this.notifications.collect().catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Não consegui gerar o aviso de nota alta: ${reason}`);
    });
    return result;
  }
}
