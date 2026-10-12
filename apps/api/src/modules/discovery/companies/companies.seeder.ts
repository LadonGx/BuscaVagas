import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { COMPANY_SEEDS } from '../discovery.constants';
import { TrackedCompaniesStore, type CompanySeed } from './tracked-companies.store';

/**
 * Na subida: importa as empresas do `.env` (`GREENHOUSE_COMPANIES`...) para
 * o banco, se ainda não importou. Banco fora do ar não derruba a API — tenta
 * de novo na próxima subida.
 */
@Injectable()
export class CompaniesSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger('Empresas');

  constructor(
    private readonly store: TrackedCompaniesStore,
    @Inject(COMPANY_SEEDS) private readonly seeds: CompanySeed[],
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const count = await this.store.importSeedsOnce(this.seeds);
      if (count) {
        this.logger.log(
          `${count} empresa(s) do .env importada(s). A partir de agora a lista é editada em Preferências → Fontes.`,
        );
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Não consegui importar as empresas do .env: ${reason}`);
    }
  }
}
