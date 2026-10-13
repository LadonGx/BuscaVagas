import { Module } from '@nestjs/common';
import { AvailabilityService, availabilityHttpProvider } from './availability.service';
import { FingerprintBackfill } from './fingerprint-backfill';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

/**
 * Vagas: cadastro manual, listagem com filtros e `ingest` para as fontes,
 * com a detecção de repostadas e duplicadas.
 * Planos: docs/features/01-jobs.md, docs/features/11-reposts.md
 */
@Module({
  controllers: [JobsController],
  providers: [JobsService, FingerprintBackfill, AvailabilityService, availabilityHttpProvider],
  exports: [JobsService, AvailabilityService],
})
export class JobsModule {}
