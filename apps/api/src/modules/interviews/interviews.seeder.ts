import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { INTERVIEW_SEEDS } from './interview-seeds';
import { InterviewsService } from './interviews.service';

/**
 * Na primeira subida, a lista inicial de perguntas (sem respostas). Banco
 * fora do ar não derruba a API — tenta de novo na próxima subida.
 */
@Injectable()
export class InterviewsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger('Entrevistas');

  constructor(private readonly interviews: InterviewsService) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const count = await this.interviews.seedOnce(INTERVIEW_SEEDS);
      if (count)
        this.logger.log(`${count} perguntas de entrevista comuns adicionadas (sem resposta).`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Não consegui adicionar as perguntas iniciais: ${reason}`);
    }
  }
}
