import type { RetentionReportDto } from '@busca-vagas/shared';
import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { RetentionService } from './retention.service';

/** Plano: docs/features/08-retention.md */
@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly retention: RetentionService) {}

  /** Prévia: quanto a limpeza apagaria agora. Não apaga nada. */
  @Get('retention')
  preview(): Promise<RetentionReportDto> {
    return this.retention.preview();
  }

  /** Roda a limpeza agora (a diária continua agendada). */
  @Post('retention')
  @HttpCode(HttpStatus.OK)
  run(): Promise<RetentionReportDto> {
    return this.retention.run();
  }
}
