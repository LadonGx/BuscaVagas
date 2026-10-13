import { createHash } from 'node:crypto';
import {
  canonicalResume,
  RESUME_FILE_MAX_BYTES,
  resumeHasContent,
  type ResumeFileInput,
  type ResumeSectionDto,
  type ResumeSnapshotDto,
} from '@busca-vagas/shared';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { readResumeSections } from '../resume/resume.service';

type Tx = Prisma.TransactionClient;

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

/** Hash do conteúdo do currículo (o mesmo texto canônico dá o mesmo hash). */
export const resumeHash = (sections: readonly ResumeSectionDto[]) =>
  sha256(canonicalResume(sections));

/**
 * Guarda o currículo de agora e devolve a cópia (nova ou a que já existia com
 * o mesmo conteúdo). Currículo vazio: `null`, nada é guardado.
 */
export async function snapshotResume(tx: Tx): Promise<{ id: string } | null> {
  const sections = await readResumeSections(tx);
  if (!resumeHasContent(sections)) return null;
  const hash = resumeHash(sections);
  return tx.resumeSnapshot.upsert({
    where: { hash },
    create: { hash, sections: sections as unknown as Prisma.InputJsonValue },
    update: {},
    select: { id: true },
  });
}

/** Apaga cópias que nenhuma candidatura usa mais. */
export async function pruneSnapshots(tx: Tx): Promise<void> {
  await tx.resumeSnapshot.deleteMany({ where: { applications: { none: {} } } });
}

/** `"currículo.pdf"` → `"currículo.pdf"`; sem extensão ganha `.pdf`. */
const pdfName = (name: string) => (/\.pdf$/i.test(name) ? name : `${name}.pdf`);

/**
 * O currículo de cada candidatura: a cópia do app e o PDF enviado.
 * Plano: docs/features/14-resume-versions.md
 */
@Injectable()
export class ResumeVersionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Hash do currículo de hoje (para "igual ao de hoje"). */
  async currentHash(): Promise<string> {
    return resumeHash(await readResumeSections(this.prisma));
  }

  /** A cópia guardada nesta candidatura. */
  async get(applicationId: string): Promise<ResumeSnapshotDto> {
    const application = await this.find(applicationId, {
      resumeSavedAt: true,
      resumeSnapshot: { select: { id: true, sections: true } },
    });
    if (!application.resumeSnapshot || !application.resumeSavedAt) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Esta candidatura não tem cópia do currículo.',
      });
    }
    return {
      id: application.resumeSnapshot.id,
      savedAt: application.resumeSavedAt.toISOString(),
      sections: application.resumeSnapshot.sections as unknown as ResumeSectionDto[],
    };
  }

  /** "Guardar o currículo de hoje" — troca a cópia da candidatura pela de agora. */
  async save(applicationId: string, now = new Date()): Promise<void> {
    await this.find(applicationId, { id: true });
    await this.prisma.$transaction(async (tx) => {
      const snapshot = await snapshotResume(tx);
      if (!snapshot) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'O currículo está vazio: preencha antes de guardar uma cópia.',
        });
      }
      await tx.application.update({
        where: { id: applicationId },
        data: { resumeSnapshotId: snapshot.id, resumeSavedAt: now },
      });
      await pruneSnapshots(tx);
    });
  }

  /** Anexa (ou troca) o PDF enviado. */
  async attach(applicationId: string, input: ResumeFileInput): Promise<void> {
    await this.find(applicationId, { id: true });
    const content = Buffer.from(input.contentBase64, 'base64');
    if (content.length > RESUME_FILE_MAX_BYTES) {
      throw new PayloadTooLargeException({
        statusCode: 413,
        message: 'O PDF passa de 10 MB.',
      });
    }
    if (content.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Isso não parece um PDF.',
      });
    }
    const data = {
      name: pdfName(input.name),
      size: content.length,
      sha256: sha256(content),
      content: new Uint8Array(content),
    };
    await this.prisma.applicationFile.upsert({
      where: { applicationId },
      create: { applicationId, ...data },
      update: { ...data, createdAt: new Date() },
    });
  }

  async download(applicationId: string): Promise<{ name: string; content: Buffer }> {
    const file = await this.prisma.applicationFile.findUnique({
      where: { applicationId },
      select: { name: true, content: true },
    });
    if (!file) {
      throw new NotFoundException({ statusCode: 404, message: 'Nenhum PDF anexado.' });
    }
    return { name: file.name, content: Buffer.from(file.content) };
  }

  async removeFile(applicationId: string): Promise<void> {
    await this.find(applicationId, { id: true });
    await this.prisma.applicationFile.deleteMany({ where: { applicationId } });
  }

  private async find<S extends Prisma.ApplicationSelect>(id: string, select: S) {
    const found = await this.prisma.application.findUnique({ where: { id }, select });
    if (!found) {
      throw new NotFoundException({ statusCode: 404, message: 'Candidatura não encontrada.' });
    }
    return found;
  }
}
