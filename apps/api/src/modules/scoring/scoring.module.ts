import { Global, Module } from '@nestjs/common';
import { ScoringBootstrap } from './scoring.bootstrap';
import { SCORE_REQUESTER } from './scoring.constants';
import { ScoringProcessor } from './scoring.processor';
import { BullScoreRequester } from './scoring.queue';
import { ScoringService } from './scoring.service';

/**
 * Nota de aderência em segundo plano. Global: vagas e preferências só
 * precisam do `SCORE_REQUESTER` para pedir um cálculo, sem importar a fila.
 * Nos testes sem Redis o requester simplesmente não existe (é `@Optional`).
 *
 * Plano: docs/features/07-preferences-score.md
 */
@Global()
@Module({
  providers: [
    ScoringService,
    ScoringProcessor,
    ScoringBootstrap,
    { provide: SCORE_REQUESTER, useClass: BullScoreRequester },
  ],
  exports: [SCORE_REQUESTER, ScoringService],
})
export class ScoringModule {}
