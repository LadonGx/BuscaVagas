import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/**
 * Painel da tela Início: só leitura, a partir de vagas e candidaturas.
 * Plano: docs/features/09-screen-data.md
 */
@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
