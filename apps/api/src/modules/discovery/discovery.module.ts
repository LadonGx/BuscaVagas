import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { DiscoveryController } from './discovery.controller';
import {
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
 * Plano: docs/features/05-discovery-gupy.md
 */
@Module({
  imports: [JobsModule],
  controllers: [DiscoveryController],
  providers: [
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
