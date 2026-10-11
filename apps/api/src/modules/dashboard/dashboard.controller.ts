import type { DashboardDto } from '@busca-vagas/shared';
import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

/** Plano: docs/features/09-screen-data.md */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get(): Promise<DashboardDto> {
    return this.dashboard.get();
  }
}
