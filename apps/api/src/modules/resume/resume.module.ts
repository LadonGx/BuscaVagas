import { Module } from '@nestjs/common';
import { ResumeController } from './resume.controller';
import { ResumeService } from './resume.service';

/**
 * Currículo em blocos ("gaveta"): seções e itens prontos para copiar.
 * Plano: docs/features/04-resume.md
 */
@Module({
  controllers: [ResumeController],
  providers: [ResumeService],
  exports: [ResumeService],
})
export class ResumeModule {}
