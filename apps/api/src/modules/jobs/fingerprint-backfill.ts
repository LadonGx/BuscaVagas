import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { JobsService } from './jobs.service';

/**
 * Na subida: vagas de antes da detecção de repostagem ganham a impressão
 * digital, para as próximas chegadas poderem ser comparadas com elas.
 * Banco fora do ar não derruba a API — tenta de novo na próxima subida.
 */
@Injectable()
export class FingerprintBackfill implements OnApplicationBootstrap {
  private readonly logger = new Logger('Vagas');

  constructor(private readonly jobs: JobsService) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const count = await this.jobs.backfillFingerprints();
      if (count > 0) {
        this.logger.log(`${count} vaga(s) antigas ganharam a impressão digital (repostagens).`);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Não consegui calcular as impressões das vagas antigas: ${reason}`);
    }
  }
}
