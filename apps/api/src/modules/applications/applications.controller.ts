import {
  addStatusEventInputSchema,
  applicationListQuerySchema,
  createApplicationInputSchema,
  resumeFileInputSchema,
  type ResumeFileInput,
  type ResumeSnapshotDto,
  updateApplicationInputSchema,
  updateStatusEventInputSchema,
  type AddStatusEventInput,
  type ApplicationDetailDto,
  type ApplicationDto,
  type ApplicationListQuery,
  type ApplicationSummaryDto,
  type CreateApplicationInput,
  type Page,
  type UpdateApplicationInput,
  type UpdateStatusEventInput,
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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ApplicationsService } from './applications.service';
import { ResumeVersionsService } from './resume-versions.service';

/** Plano: docs/features/03-applications.md */
@Controller('applications')
export class ApplicationsController {
  constructor(
    private readonly applications: ApplicationsService,
    private readonly versions: ResumeVersionsService,
  ) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(createApplicationInputSchema)) body: CreateApplicationInput,
  ): Promise<ApplicationDetailDto> {
    return this.applications.create(body);
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(applicationListQuerySchema)) query: ApplicationListQuery,
  ): Promise<Page<ApplicationDto>> {
    return this.applications.list(query);
  }

  // Antes de ':id', senão "summary" seria lido como um id.
  @Get('summary')
  summary(): Promise<ApplicationSummaryDto> {
    return this.applications.summary();
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<ApplicationDetailDto> {
    return this.applications.get(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateApplicationInputSchema)) body: UpdateApplicationInput,
  ): Promise<ApplicationDetailDto> {
    return this.applications.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.applications.remove(id);
  }

  @Post(':id/events')
  addEvent(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addStatusEventInputSchema)) body: AddStatusEventInput,
  ): Promise<ApplicationDetailDto> {
    return this.applications.addEvent(id, body);
  }

  @Patch(':id/events/:eventId')
  updateEvent(
    @Param('id') id: string,
    @Param('eventId') eventId: string,
    @Body(new ZodValidationPipe(updateStatusEventInputSchema)) body: UpdateStatusEventInput,
  ): Promise<ApplicationDetailDto> {
    return this.applications.updateEvent(id, eventId, body);
  }

  @Delete(':id/events/:eventId')
  removeEvent(
    @Param('id') id: string,
    @Param('eventId') eventId: string,
  ): Promise<ApplicationDetailDto> {
    return this.applications.removeEvent(id, eventId);
  }

  /* ------------- currículo da candidatura (docs/features/14-resume-versions.md) */

  @Get(':id/resume')
  resume(@Param('id') id: string): Promise<ResumeSnapshotDto> {
    return this.versions.get(id);
  }

  /** Guarda o currículo de hoje nesta candidatura (troca a cópia). */
  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  async saveResume(@Param('id') id: string): Promise<ApplicationDetailDto> {
    await this.versions.save(id);
    return this.applications.get(id);
  }

  /** O PDF enviado, em base64 dentro de JSON (a API só aceita escrita em JSON). */
  @Put(':id/resume-file')
  async attachFile(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resumeFileInputSchema)) body: ResumeFileInput,
  ): Promise<ApplicationDetailDto> {
    await this.versions.attach(id, body);
    return this.applications.get(id);
  }

  @Get(':id/resume-file')
  async downloadFile(@Param('id') id: string, @Res() response: Response): Promise<void> {
    const file = await this.versions.download(id);
    response
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Length': String(file.content.length),
        'Content-Disposition': `attachment; filename="${file.name.replace(/[^\x20-\x7e]|"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        'X-Content-Type-Options': 'nosniff',
      })
      .end(file.content);
  }

  @Delete(':id/resume-file')
  async removeFile(@Param('id') id: string): Promise<ApplicationDetailDto> {
    await this.versions.removeFile(id);
    return this.applications.get(id);
  }
}
