import { Module } from '@nestjs/common';
import { ResumeModule } from '../resume/resume.module';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

/** Tela de Métricas. Plano: docs/features/17-metrics.md */
@Module({
  imports: [ResumeModule],
  controllers: [MetricsController],
  providers: [MetricsService],
})
export class MetricsModule {}
