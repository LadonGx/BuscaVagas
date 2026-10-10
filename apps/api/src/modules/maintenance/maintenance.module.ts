import { Module } from '@nestjs/common';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceProcessor } from './maintenance.processor';
import { MaintenanceScheduler } from './maintenance.scheduler';
import { RetentionService } from './retention.service';

/**
 * Tarefas de casa. Hoje: retenção — apaga descartadas e caixa esquecida
 * depois de RETENTION_DAYS, uma vez por dia (fila `maintenance`).
 *
 * Plano: docs/features/08-retention.md
 */
@Module({
  controllers: [MaintenanceController],
  providers: [RetentionService, MaintenanceProcessor, MaintenanceScheduler],
})
export class MaintenanceModule {}
