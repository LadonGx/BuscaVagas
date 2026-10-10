import { Processor, WorkerHost } from '@nestjs/bullmq';
import { QUEUES } from '../../queue/queue.constants';
import { ScoringService } from './scoring.service';

/**
 * Consome a fila `scoring`. Um job por vez: nota é trabalho de fundo, de
 * baixa prioridade, e não disputa espaço com a busca de vagas (fila própria).
 */
@Processor(QUEUES.SCORING, { concurrency: 1 })
export class ScoringProcessor extends WorkerHost {
  constructor(private readonly scoring: ScoringService) {
    super();
  }

  process() {
    return this.scoring.scoreStale();
  }
}
