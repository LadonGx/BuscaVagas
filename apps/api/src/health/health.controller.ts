import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService, type HealthReport } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** 200 com tudo de pé; 503 quando banco ou Redis caiu (o corpo diz qual). */
  @Get()
  @HttpCode(HttpStatus.OK)
  async get(@Res({ passthrough: true }) response: Response): Promise<HealthReport> {
    const report = await this.health.check();

    if (report.status !== 'ok') {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return report;
  }
}
