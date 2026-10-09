import {
  bulkTriageInputSchema,
  createJobInputSchema,
  jobListQuerySchema,
  triageInputSchema,
  updateJobInputSchema,
  type BulkTriageInput,
  type BulkTriageResult,
  type CreateJobInput,
  type JobDto,
  type JobListQuery,
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
import { JobsService } from './jobs.service';

/** Plano: docs/features/01-jobs.md */
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

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
}
