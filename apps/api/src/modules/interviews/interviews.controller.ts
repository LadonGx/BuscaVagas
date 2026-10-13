import {
  askedInputSchema,
  createInterviewQuestionInputSchema,
  practiceInputSchema,
  updateInterviewQuestionInputSchema,
  type AskedInput,
  type CreateInterviewQuestionInput,
  type InterviewQuestionDto,
  type PracticeInput,
  type UpdateInterviewQuestionInput,
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
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { InterviewsService } from './interviews.service';

/** Plano: docs/features/15-interview-questions.md */
@Controller('interview-questions')
export class InterviewsController {
  constructor(private readonly interviews: InterviewsService) {}

  @Get()
  list(): Promise<InterviewQuestionDto[]> {
    return this.interviews.list();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createInterviewQuestionInputSchema))
    body: CreateInterviewQuestionInput,
  ): Promise<InterviewQuestionDto> {
    return this.interviews.create(body);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<InterviewQuestionDto> {
    return this.interviews.get(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateInterviewQuestionInputSchema))
    body: UpdateInterviewQuestionInput,
  ): Promise<InterviewQuestionDto> {
    return this.interviews.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.interviews.remove(id);
  }

  @Post(':id/practice')
  @HttpCode(HttpStatus.OK)
  practice(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(practiceInputSchema)) body: PracticeInput,
  ): Promise<InterviewQuestionDto> {
    return this.interviews.practice(id, body);
  }

  @Put(':id/asked/:applicationId')
  markAsked(
    @Param('id') id: string,
    @Param('applicationId') applicationId: string,
    @Body(new ZodValidationPipe(askedInputSchema)) body: AskedInput,
  ): Promise<InterviewQuestionDto> {
    return this.interviews.markAsked(id, applicationId, body);
  }

  @Delete(':id/asked/:applicationId')
  unmarkAsked(
    @Param('id') id: string,
    @Param('applicationId') applicationId: string,
  ): Promise<InterviewQuestionDto> {
    return this.interviews.unmarkAsked(id, applicationId);
  }
}
