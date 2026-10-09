import {
  createResumeSectionInputSchema,
  reorderInputSchema,
  resumeItemInputSchema,
  updateResumeSectionInputSchema,
  type CreateResumeSectionInput,
  type ReorderInput,
  type ResumeDto,
  type ResumeItemDto,
  type ResumeItemInput,
  type ResumeSectionDto,
  type UpdateResumeSectionInput,
} from '@busca-vagas/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResumeService } from './resume.service';

/** Plano: docs/features/04-resume.md */
@Controller('resume')
export class ResumeController {
  constructor(private readonly resume: ResumeService) {}

  @Get()
  get(): Promise<ResumeDto> {
    return this.resume.get();
  }

  /** O currículo inteiro em texto puro, para "cole seu currículo aqui". */
  @Get('export')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  export(): Promise<string> {
    return this.resume.exportText();
  }

  /* ------------------------------------------------------------ seções */

  @Post('sections')
  createSection(
    @Body(new ZodValidationPipe(createResumeSectionInputSchema)) body: CreateResumeSectionInput,
  ): Promise<ResumeSectionDto> {
    return this.resume.createSection(body);
  }

  @Put('sections/order')
  reorderSections(
    @Body(new ZodValidationPipe(reorderInputSchema)) body: ReorderInput,
  ): Promise<ResumeDto> {
    return this.resume.reorderSections(body.ids);
  }

  @Patch('sections/:id')
  updateSection(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateResumeSectionInputSchema)) body: UpdateResumeSectionInput,
  ): Promise<ResumeSectionDto> {
    return this.resume.updateSection(id, body);
  }

  @Delete('sections/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeSection(@Param('id') id: string): Promise<void> {
    return this.resume.removeSection(id);
  }

  /* ------------------------------------------------------------- itens */

  @Post('sections/:id/items')
  addItem(
    @Param('id') sectionId: string,
    @Body(new ZodValidationPipe(resumeItemInputSchema)) body: ResumeItemInput,
  ): Promise<ResumeItemDto> {
    return this.resume.addItem(sectionId, body.data);
  }

  @Put('sections/:id/items/order')
  reorderItems(
    @Param('id') sectionId: string,
    @Body(new ZodValidationPipe(reorderInputSchema)) body: ReorderInput,
  ): Promise<ResumeSectionDto> {
    return this.resume.reorderItems(sectionId, body.ids);
  }

  @Patch('items/:id')
  updateItem(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resumeItemInputSchema)) body: ResumeItemInput,
  ): Promise<ResumeItemDto> {
    return this.resume.updateItem(id, body.data);
  }

  @Delete('items/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeItem(@Param('id') id: string): Promise<void> {
    return this.resume.removeItem(id);
  }
}
