import type { BackupInspectDto, BackupRestoreResultDto } from '@busca-vagas/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { localTimeZone } from '../dashboard/local-day';
import { applicationsCsv } from './applications-csv';
import { BackupService, backupFileName } from './backup.service';

/** O corpo do POST é o .zip cru (`Content-Type: application/zip`). */
function zipBody(body: unknown): Uint8Array {
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new BadRequestException({
      statusCode: 400,
      message: 'Envie o arquivo .zip do backup (Content-Type: application/zip).',
    });
  }
  return new Uint8Array(body);
}

const download = (response: Response, name: string, type: string, content: Uint8Array | string) =>
  response
    .status(200)
    .set({
      'Content-Type': type,
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    .end(typeof content === 'string' ? content : Buffer.from(content));

/** Plano: docs/features/18-backup.md */
@Controller('backup')
export class BackupController {
  constructor(
    private readonly backup: BackupService,
    private readonly prisma: PrismaService,
  ) {}

  /** Baixa o backup completo (.zip). */
  @Get()
  async export(@Res() response: Response): Promise<void> {
    const now = new Date();
    download(response, backupFileName(now), 'application/zip', await this.backup.export(now));
  }

  /** O que tem no arquivo e se dá para restaurar (não muda nada). */
  @Post('inspect')
  @HttpCode(HttpStatus.OK)
  inspect(@Body() body: unknown): Promise<BackupInspectDto> {
    return this.backup.inspect(zipBody(body));
  }

  /** Troca tudo pelo backup (guarda antes uma cópia do que havia). */
  @Post('restore')
  @HttpCode(HttpStatus.OK)
  restore(@Body() body: unknown): Promise<BackupRestoreResultDto> {
    return this.backup.restore(zipBody(body));
  }

  /** Candidaturas em CSV (Excel/Sheets). */
  @Get('applications.csv')
  async applications(@Res() response: Response): Promise<void> {
    const rows = await this.prisma.application.findMany({
      orderBy: [{ appliedAt: 'desc' }, { id: 'asc' }],
      include: { job: { select: { title: true, company: true, source: true, url: true } } },
    });
    const name = `buscavagas-candidaturas-${new Date().toISOString().slice(0, 10)}.csv`;
    download(response, name, 'text/csv; charset=utf-8', applicationsCsv(rows, localTimeZone()));
  }
}
