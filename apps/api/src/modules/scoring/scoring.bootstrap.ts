import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { SCORE_REQUESTER, type ScoreRequester } from './scoring.constants';

/**
 * Na subida, pede um cálculo: pega vagas que ficaram pendentes enquanto a
 * API estava parada (ou que vieram de uma migration). Sem pendentes, é uma
 * consulta só.
 */
@Injectable()
export class ScoringBootstrap implements OnApplicationBootstrap {
  constructor(@Inject(SCORE_REQUESTER) private readonly requester: ScoreRequester) {}

  onApplicationBootstrap(): void {
    void this.requester.request('startup');
  }
}
