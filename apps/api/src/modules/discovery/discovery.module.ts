import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { CompaniesController } from './companies/companies.controller';
import { CompaniesSeeder } from './companies/companies.seeder';
import { CompaniesService } from './companies/companies.service';
import { TrackedCompaniesStore } from './companies/tracked-companies.store';
import { DiscoveryController } from './discovery.controller';
import {
  companySeedsProvider,
  sourceHttpClientProvider,
  sourceRegistryProvider,
  sourcesProvider,
  unavailableSourcesProvider,
} from './discovery.providers';
import { DiscoveryScheduler } from './discovery.scheduler';
import { DiscoveryService } from './discovery.service';
import { ScanRunner } from './scan-runner.service';
import { SourceScanProcessor } from './source-scan.processor';

/**
 * Descoberta: roda QUALQUER fonte do pacote @busca-vagas/sources pela fila
 * `source-scan`, grava as vagas e o histórico (SourceRun), e agenda as
 * varreduras automáticas. Não conhece nenhuma fonte pelo nome.
 *
 * Também cuida da lista de empresas dos boards (`companies/`), que a busca lê
 * do banco a cada execução.
 *
 * Planos: docs/features/05-discovery-gupy.md, docs/features/06-company-boards.md
 */
@Module({
  imports: [JobsModule],
  controllers: [DiscoveryController, CompaniesController],
  providers: [
    companySeedsProvider,
    TrackedCompaniesStore,
    CompaniesService,
    CompaniesSeeder,
    sourceRegistryProvider,
    sourcesProvider,
    unavailableSourcesProvider,
    sourceHttpClientProvider,
    ScanRunner,
    DiscoveryService,
    DiscoveryScheduler,
    SourceScanProcessor,
  ],
})
export class DiscoveryModule {}
