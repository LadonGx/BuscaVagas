import {
  APPLICATION_STATUSES,
  deriveApplicationState,
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
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { afterCursor, decodeCursor, toPage } from '../../common/pagination/cursor';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  applicationDetailInclude,
  applicationInclude,
  toApplicationDetailDto,
  toApplicationDto,
} from './applications.mapper';

type Tx = Prisma.TransactionClient;

/**
 * Candidaturas com histórico de status.
 * Plano: docs/features/03-applications.md
 *
 * Regra central: `status` e `appliedAt` da candidatura são recalculados a
 * partir dos eventos, na MESMA transação, sempre que um evento muda.
 */
@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateApplicationInput): Promise<ApplicationDetailDto> {
    const job = await this.prisma.job.findUnique({
      where: { id: input.jobId },
      select: { id: true, triage: true, application: { select: { id: true } } },
    });

    if (!job) {
      throw new NotFoundException({ statusCode: 404, message: 'Vaga não encontrada.' });
    }

    if (job.application) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Esta vaga já tem uma candidatura.',
        existingApplicationId: job.application.id,
      });
    }

    const now = new Date();
    const occurredAt = input.occurredAt ?? now;

    const id = await this.prisma.$transaction(async (tx) => {
      const application = await tx.application.create({
        data: {
          jobId: job.id,
          status: input.status,
          appliedAt: occurredAt,
          appliedVia: input.appliedVia ?? null,
          salaryExpectation: input.salaryExpectation ?? null,
          notes: input.notes ?? null,
          events: { create: { status: input.status, occurredAt } },
        },
        select: { id: true },
      });

      // Candidatar-se é a decisão mais forte de triagem: a vaga fica salva.
      if (job.triage !== 'saved') {
        await tx.job.update({
          where: { id: job.id },
          data: { triage: 'saved', triagedAt: now, dismissReason: null },
        });
      }

      return application.id;
    });

    return this.get(id);
  }

  async list(query: ApplicationListQuery): Promise<Page<ApplicationDto>> {
    const and: Prisma.ApplicationWhereInput[] = [];

    if (query.status) {
      and.push({ status: { in: query.status } });
    }

    if (query.q) {
      and.push({
        job: {
          OR: [
            { title: { contains: query.q, mode: 'insensitive' } },
            { company: { contains: query.q, mode: 'insensitive' } },
          ],
        },
      });
    }

    if (query.cursor) {
      and.push(
        afterCursor('updatedAt', decodeCursor(query.cursor)) as Prisma.ApplicationWhereInput,
      );
    }

    const rows = await this.prisma.application.findMany({
      where: { AND: and },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: applicationInclude,
    });

    return toPage(rows, query.limit, (row) => row.updatedAt, toApplicationDto);
  }

  async summary(): Promise<ApplicationSummaryDto> {
    const groups = await this.prisma.application.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const summary = Object.fromEntries(APPLICATION_STATUSES.map((status) => [status, 0])) as Record<
      (typeof APPLICATION_STATUSES)[number],
      number
    >;
    let total = 0;

    for (const group of groups) {
      summary[group.status] = group._count._all;
      total += group._count._all;
    }

    return { ...summary, total };
  }

  async get(id: string): Promise<ApplicationDetailDto> {
    const row = await this.prisma.application.findUnique({
      where: { id },
      include: applicationDetailInclude,
    });

    if (!row) {
      throw notFound();
    }

    return toApplicationDetailDto(row);
  }

  async update(id: string, input: UpdateApplicationInput): Promise<ApplicationDetailDto> {
    await this.assertExists(id);
    await this.prisma.application.update({ where: { id }, data: input });
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    await this.assertExists(id);
    // Os eventos vão junto (onDelete: Cascade). A triagem da vaga fica como está.
    await this.prisma.application.delete({ where: { id } });
  }

  /* ------------------------------------------------------------ eventos */

  async addEvent(id: string, input: AddStatusEventInput): Promise<ApplicationDetailDto> {
    await this.assertExists(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.statusEvent.create({
        data: {
          applicationId: id,
          status: input.status,
          occurredAt: input.occurredAt ?? new Date(),
          note: input.note ?? null,
        },
      });
      await recompute(tx, id);
    });

    return this.get(id);
  }

  async updateEvent(
    id: string,
    eventId: string,
    input: UpdateStatusEventInput,
  ): Promise<ApplicationDetailDto> {
    await this.assertEventBelongs(id, eventId);

    await this.prisma.$transaction(async (tx) => {
      await tx.statusEvent.update({ where: { id: eventId }, data: input });
      await recompute(tx, id);
    });

    return this.get(id);
  }

  async removeEvent(id: string, eventId: string): Promise<ApplicationDetailDto> {
    await this.assertEventBelongs(id, eventId);

    await this.prisma.$transaction(async (tx) => {
      const count = await tx.statusEvent.count({ where: { applicationId: id } });

      if (count <= 1) {
        throw new ConflictException({
          statusCode: 409,
          message:
            'Este é o único evento da candidatura. Para desfazer tudo, apague a candidatura.',
        });
      }

      await tx.statusEvent.delete({ where: { id: eventId } });
      await recompute(tx, id);
    });

    return this.get(id);
  }

  /* ----------------------------------------------------------- internos */

  private async assertExists(id: string): Promise<void> {
    const found = await this.prisma.application.findUnique({ where: { id }, select: { id: true } });
    if (!found) {
      throw notFound();
    }
  }

  private async assertEventBelongs(id: string, eventId: string): Promise<void> {
    const event = await this.prisma.statusEvent.findUnique({
      where: { id: eventId },
      select: { applicationId: true },
    });

    if (!event || event.applicationId !== id) {
      throw new NotFoundException({ statusCode: 404, message: 'Evento não encontrado.' });
    }
  }
}

/** Recalcula status e appliedAt a partir do histórico. Sempre dentro da transação. */
async function recompute(tx: Tx, applicationId: string): Promise<void> {
  const events = await tx.statusEvent.findMany({
    where: { applicationId },
    select: { status: true, occurredAt: true, createdAt: true },
  });

  await tx.application.update({
    where: { id: applicationId },
    data: deriveApplicationState(events),
  });
}

function notFound(): NotFoundException {
  return new NotFoundException({ statusCode: 404, message: 'Candidatura não encontrada.' });
}
