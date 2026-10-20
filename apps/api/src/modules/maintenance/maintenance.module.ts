import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceProcessor } from './maintenance.processor';
import { MaintenanceScheduler } from './maintenance.scheduler';
import { RecencyRefreshService } from './recency-refresh.service';
import { RetentionService } from './retention.service';

/**
 * Tarefas de casa, uma vez por dia (fila `maintenance`):
 *  - retenção — apaga descartadas e caixa esquecida depois de RETENTION_DAYS
 *    (docs/features/08-retention.md);
 *  - conferência das salvas — ainda estão abertas?
 *    (docs/features/13-availability.md);
 *  - idade das vagas na nota — as pontuadas antes de hoje voltam para a fila
 *    (docs/features/07-preferences-score.md).
 */
@Module({
  imports: [JobsModule],
  controllers: [MaintenanceController],
  providers: [RetentionService, RecencyRefreshService, MaintenanceProcessor, MaintenanceScheduler],
})
export class MaintenanceModule {}
