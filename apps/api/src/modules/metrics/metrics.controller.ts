import { metricsQuerySchema, type MetricsDto, type MetricsQuery } from '@busca-vagas/shared';
import { Controller, Get, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { MetricsService } from './metrics.service';

/** Plano: docs/features/17-metrics.md */
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  /** `?days=30|90|0` (0 = tudo; padrão 90). */
  @Get()
  get(@Query(new ZodValidationPipe(metricsQuerySchema)) query: MetricsQuery): Promise<MetricsDto> {
    return this.metrics.get(query.days);
  }
}
