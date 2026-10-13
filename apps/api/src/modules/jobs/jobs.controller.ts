import {
  bulkTriageInputSchema,
  createJobInputSchema,
  jobListQuerySchema,
  muteRepostsInputSchema,
  triageInputSchema,
  updateJobInputSchema,
  type BulkTriageInput,
  type BulkTriageResult,
  type CreateJobInput,
  type JobCountsDto,
  type JobDto,
  type JobHistoryDto,
  type JobListQuery,
  type MuteRepostsInput,
  type Page,
  type TriageInput,
  type UpdateJobInput,
} from '@busca-vagas/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AvailabilityService } from './availability.service';
import { JobsService } from './jobs.service';

/** Plano: docs/features/01-jobs.md */
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly availability: AvailabilityService,
  ) {}

  @Post()
  create(@Body(new ZodValidationPipe(createJobInputSchema)) body: CreateJobInput): Promise<JobDto> {
    return this.jobs.create(body);
  }

  /** Triagem em lote. Plano: docs/features/02-triage.md */
  @Post('triage')
  @HttpCode(HttpStatus.OK)
  bulkTriage(
    @Body(new ZodValidationPipe(bulkTriageInputSchema)) body: BulkTriageInput,
  ): Promise<BulkTriageResult> {
    return this.jobs.bulkTriage(body);
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(jobListQuerySchema)) query: JobListQuery,
  ): Promise<Page<JobDto>> {
    return this.jobs.list(query);
  }

  /** Contagens para o menu e a prévia das preferências. Antes de ':id'. */
  @Get('counts')
  counts(): Promise<JobCountsDto> {
    return this.jobs.counts();
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<JobDto> {
    return this.jobs.get(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateJobInputSchema)) body: UpdateJobInput,
  ): Promise<JobDto> {
    return this.jobs.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.jobs.remove(id);
  }

  /** Salvar, descartar ou desfazer (`inbox`). */
  @Put(':id/triage')
  setTriage(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(triageInputSchema)) body: TriageInput,
  ): Promise<JobDto> {
    return this.jobs.setTriage(id, body);
  }

  /** Outras vezes em que a vaga apareceu (repostagens). Plano: docs/features/11-reposts.md */
  @Get(':id/history')
  history(@Param('id') id: string): Promise<JobHistoryDto> {
    return this.jobs.history(id);
  }

  /** `{ muted: true }` = repostagens desta vaga entram já descartadas. */
  @Put(':id/reposts')
  muteReposts(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(muteRepostsInputSchema)) body: MuteRepostsInput,
  ): Promise<JobHistoryDto> {
    return this.jobs.muteReposts(id, body);
  }

  /** Confere agora se a vaga ainda está aberta. Plano: docs/features/13-availability.md */
  @Post(':id/check')
  @HttpCode(HttpStatus.OK)
  check(@Param('id') id: string): Promise<JobDto> {
    return this.availability.check(id);
  }
}
