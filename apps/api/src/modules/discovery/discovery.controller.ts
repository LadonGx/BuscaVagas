import {
  type Page,
  scanInputSchema,
  sourceRunsQuerySchema,
  type ScanInput,
  type ScanResultDto,
  type SourceInfoDto,
  type SourceRunDto,
  type SourceRunsQuery,
} from '@busca-vagas/shared';
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DiscoveryService } from './discovery.service';

/** Plano: docs/features/05-discovery-gupy.md */
@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get('sources')
  sources(): Promise<SourceInfoDto[]> {
    return this.discovery.listSources();
  }

  /** Coloca a varredura na fila e responde na hora (202). Acompanhe em /runs. */
  @Post('scan')
  @HttpCode(HttpStatus.ACCEPTED)
  scan(@Body(new ZodValidationPipe(scanInputSchema)) body: ScanInput): Promise<ScanResultDto> {
    return this.discovery.scan(body);
  }

  @Get('runs')
  runs(
    @Query(new ZodValidationPipe(sourceRunsQuerySchema)) query: SourceRunsQuery,
  ): Promise<Page<SourceRunDto>> {
    return this.discovery.runs(query);
  }
}
