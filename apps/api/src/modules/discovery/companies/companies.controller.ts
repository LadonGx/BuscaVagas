import {
  addCompanyInputSchema,
  checkCompanyInputSchema,
  updateCompanyInputSchema,
  type AddCompanyInput,
  type AddCompanyResultDto,
  type CheckCompanyInput,
  type CompanyCheckDto,
  type CompanyDirectoryDto,
  type TrackedCompanyDto,
  type UpdateCompanyInput,
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
} from '@nestjs/common';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { CompaniesService } from './companies.service';

/** Plano: docs/features/06-company-boards.md */
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  list(): Promise<TrackedCompanyDto[]> {
    return this.companies.list();
  }

  /** Empresas verificadas, com a marca de quais já estão na lista. */
  @Get('directory')
  directory(): Promise<CompanyDirectoryDto> {
    return this.companies.directory();
  }

  /** Lê o board agora (pelo link ou fonte + slug), sem gravar nada. */
  @Post('check')
  @HttpCode(HttpStatus.OK)
  check(
    @Body(new ZodValidationPipe(checkCompanyInputSchema)) body: CheckCompanyInput,
  ): Promise<CompanyCheckDto> {
    return this.companies.check(body);
  }

  /** Confere o board e adiciona; as vagas lidas já entram. */
  @Post()
  add(
    @Body(new ZodValidationPipe(addCompanyInputSchema)) body: AddCompanyInput,
  ): Promise<AddCompanyResultDto> {
    return this.companies.add(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCompanyInputSchema)) body: UpdateCompanyInput,
  ): Promise<TrackedCompanyDto> {
    return this.companies.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.companies.remove(id);
  }

  /** Lê o board de uma empresa da lista agora e guarda o resultado. */
  @Post(':id/check')
  @HttpCode(HttpStatus.OK)
  recheck(@Param('id') id: string): Promise<TrackedCompanyDto> {
    return this.companies.recheck(id);
  }
}
