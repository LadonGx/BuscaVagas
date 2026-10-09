import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

/**
 * Vagas: cadastro manual, listagem com filtros e `ingest` para as fontes.
 * Plano: docs/features/01-jobs.md
 */
@Module({
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
