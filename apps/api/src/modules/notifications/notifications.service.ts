import {
  DEFAULT_NOTIFY_MIN_SCORE,
  NOTIFICATION_KEEP_DAYS,
  NOTIFY_RECENT_HOURS,
  type NotificationDto,
  type NotificationSettingsDto,
  type NotificationSettingsInput,
  type NotificationsDto,
} from '@busca-vagas/shared';
import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { loadScoreVersion } from '../preferences/preferences.store';

const SETTINGS_ID = 1;
const HOUR_MS = 60 * 60 * 1000;
const LIST_SIZE = 20;

const notificationInclude = {
  jobs: {
    select: {
      id: true,
      title: true,
      company: true,
      score: true,
      triage: true,
      closedAt: true,
      deadline: true,
    },
    orderBy: [{ score: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
  },
} satisfies Prisma.NotificationInclude;

type NotificationRow = Prisma.NotificationGetPayload<{ include: typeof notificationInclude }>;

function toNotificationDto(row: NotificationRow, now: Date): NotificationDto {
  return {
    id: row.id,
    kind: 'high-score',
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
    minScore: row.minScore,
    jobs: row.jobs.map((job) => ({
      id: job.id,
      title: job.title,
      company: job.company,
      score: job.score,
      triage: job.triage,
      closed: job.closedAt !== null || (job.deadline !== null && job.deadline < now),
    })),
  };
}

/**
 * Sino do app: avisa das vagas novas com nota alta, uma vez por vaga e um
 * aviso por rodada de notas. Plano: docs/features/16-notifications.md
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Avisos');

  constructor(private readonly prisma: PrismaService) {}

  async settings(): Promise<NotificationSettingsDto> {
    const row = await this.prisma.notificationSettings.findUnique({
      where: { id: SETTINGS_ID },
    });
    return { minScore: row?.minScore ?? DEFAULT_NOTIFY_MIN_SCORE };
  }

  async saveSettings(input: NotificationSettingsInput): Promise<NotificationSettingsDto> {
    const row = await this.prisma.notificationSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, minScore: input.minScore },
      update: { minScore: input.minScore },
    });
    return { minScore: row.minScore };
  }

  /**
   * Depois de cada rodada de notas: as vagas da caixa que entraram nas
   * últimas 48 h, já pontuadas com as preferências atuais, compatíveis,
   * abertas, com nota ≥ mínima e ainda sem aviso viram UM aviso.
   * Devolve o aviso criado (ou `null`).
   */
  async collect(now = new Date()): Promise<NotificationDto | null> {
    await this.prisma.notification.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - NOTIFICATION_KEEP_DAYS * 24 * HOUR_MS) } },
    });

    const { minScore } = await this.settings();
    if (minScore <= 0) return null;
    const version = await loadScoreVersion(this.prisma);

    const notification = await this.prisma.$transaction(async (tx) => {
      const jobs = await tx.job.findMany({
        where: {
          triage: 'inbox',
          // Já se candidatou: não precisa de aviso.
          application: { is: null },
          notifiedAt: null,
          incompatible: false,
          score: { gte: minScore },
          scoredVersion: { gte: version },
          firstSeenAt: { gte: new Date(now.getTime() - NOTIFY_RECENT_HOURS * HOUR_MS) },
          closedAt: null,
          OR: [{ deadline: null }, { deadline: { gte: now } }],
        },
        select: { id: true },
      });
      if (jobs.length === 0) return null;

      const created = await tx.notification.create({
        data: { minScore, createdAt: now },
        select: { id: true },
      });
      await tx.job.updateMany({
        where: { id: { in: jobs.map((job) => job.id) } },
        data: { notifiedAt: now, notificationId: created.id },
      });
      return tx.notification.findUniqueOrThrow({
        where: { id: created.id },
        include: notificationInclude,
      });
    });

    if (!notification) return null;
    this.logger.log(`${notification.jobs.length} vaga(s) nova(s) com nota ≥ ${minScore}`);
    return toNotificationDto(notification, now);
  }

  async list(now = new Date()): Promise<NotificationsDto> {
    const [rows, unread] = await Promise.all([
      this.prisma.notification.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: LIST_SIZE,
        include: notificationInclude,
      }),
      this.prisma.notification.count({ where: { readAt: null } }),
    ]);
    return { unread, items: rows.map((row) => toNotificationDto(row, now)) };
  }

  /** Abriu o sino: tudo lido. */
  async markAllRead(now = new Date()): Promise<NotificationsDto> {
    await this.prisma.notification.updateMany({
      where: { readAt: null },
      data: { readAt: now },
    });
    return this.list(now);
  }
}
