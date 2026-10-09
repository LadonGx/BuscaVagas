import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

export interface ValidationIssue {
  path: string;
  message: string;
}

/**
 * Valida corpo/query/param com um schema Zod de `@busca-vagas/shared` e
 * devolve o valor já convertido (números, datas, defaults).
 *
 *   @Body(new ZodValidationPipe(createJobInputSchema)) body: CreateJobInput
 */
@Injectable()
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw badRequestFromZod(result.error);
    }

    return result.data;
  }
}

/** Mesmo formato de 400 do pipe, para validações feitas dentro dos services. */
export function badRequestFromZod(error: z.ZodError, prefix: string[] = []): BadRequestException {
  const issues: ValidationIssue[] = error.issues.map((issue) => ({
    path: [...prefix, ...issue.path.map(String)].join('.'),
    message: issue.message,
  }));

  return new BadRequestException({ statusCode: 400, message: 'Dados inválidos', issues });
}
