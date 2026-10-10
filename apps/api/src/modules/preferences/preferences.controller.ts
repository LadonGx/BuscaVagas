import {
  preferencesInputSchema,
  type PreferencesDto,
  type PreferencesInput,
  type PutPreferencesResultDto,
  type RescoreResultDto,
  type StackOptionDto,
} from '@busca-vagas/shared';
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PreferencesService } from './preferences.service';

/** Plano: docs/features/07-preferences-score.md */
@Controller('preferences')
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Get()
  get(): Promise<PreferencesDto> {
    return this.preferences.get();
  }

  @Put()
  put(
    @Body(new ZodValidationPipe(preferencesInputSchema)) body: PreferencesInput,
  ): Promise<PutPreferencesResultDto> {
    return this.preferences.put(body);
  }

  @Get('stacks')
  stacks(): Promise<StackOptionDto[]> {
    return this.preferences.stacks();
  }

  /** Recalcula a nota de todas as vagas em segundo plano. */
  @Post('rescore')
  @HttpCode(HttpStatus.ACCEPTED)
  rescore(): Promise<RescoreResultDto> {
    return this.preferences.rescore();
  }
}
