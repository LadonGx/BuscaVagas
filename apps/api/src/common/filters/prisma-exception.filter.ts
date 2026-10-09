import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../../generated/prisma/client';

/**
 * Traduz erros conhecidos do Prisma para HTTP. Sem isto, uma URL duplicada
 * viraria 500 — e 500 diz "bug no servidor", não "você já cadastrou isso".
 *
 * Regras de negócio NÃO devem depender deste filtro: os services checam e
 * lançam a exceção certa, com mensagem útil. Ele é a rede de proteção para a
 * corrida entre a checagem e a gravação.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const mapped = mapPrismaError(error);

    if (mapped.status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`Prisma ${error.code}: ${error.message}`);
    }

    response.status(mapped.status).json({ statusCode: mapped.status, message: mapped.message });
  }
}

export function mapPrismaError(error: { code: string }): { status: HttpStatus; message: string } {
  switch (error.code) {
    case 'P2002':
      return { status: HttpStatus.CONFLICT, message: 'Já existe um registro com estes dados.' };
    case 'P2003':
      return {
        status: HttpStatus.CONFLICT,
        message: 'O registro está ligado a outro e não pode ser alterado assim.',
      };
    case 'P2025':
      return { status: HttpStatus.NOT_FOUND, message: 'Registro não encontrado.' };
    default:
      return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Erro interno no banco.' };
  }
}
