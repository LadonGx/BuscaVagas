import {
  addStatusEventInputSchema,
  applicationListQuerySchema,
  createApplicationInputSchema,
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
  Query,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ApplicationsService } from './applications.service';

/** Plano: docs/features/03-applications.md */
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

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
}
