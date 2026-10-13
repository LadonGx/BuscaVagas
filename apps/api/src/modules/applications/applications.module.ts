import { Module } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { ResumeVersionsService } from './resume-versions.service';

/**
 * Candidaturas com histórico de status.
 * Plano: docs/features/03-applications.md
 * Currículo de cada candidatura: docs/features/14-resume-versions.md
 */
@Module({
  controllers: [ApplicationsController],
  providers: [ApplicationsService, ResumeVersionsService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
