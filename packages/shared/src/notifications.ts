import { z } from 'zod';
import type { TriageStatus } from './enums';

/**
 * Aviso de vaga nova com nota alta, no sino do app.
 * Plano: docs/features/16-notifications.md
 */

/** Só vagas que entraram nas últimas 48 h avisam (recalcular notas antigas não vira aviso). */
export const NOTIFY_RECENT_HOURS = 48;

/** Avisos com mais de 30 dias somem. */
export const NOTIFICATION_KEEP_DAYS = 30;

export const DEFAULT_NOTIFY_MIN_SCORE = 800;

export interface NotificationJobDto {
  id: string;
  title: string;
  company: string;
  score: number | null;
  /** Como está agora (pode ter sido triada depois do aviso). */
  triage: TriageStatus;
  closed: boolean;
}

export interface NotificationDto {
  id: string;
  kind: 'high-score';
  createdAt: string;
  readAt: string | null;
  /** A nota mínima quando o aviso saiu. */
  minScore: number;
  /** As vagas, da maior nota para a menor (as apagadas pela limpeza somem). */
  jobs: NotificationJobDto[];
}

export interface NotificationsDto {
  unread: number;
  items: NotificationDto[];
}

export interface NotificationSettingsDto {
  /** 0 = não avisar. */
  minScore: number;
}

export const notificationSettingsInputSchema = z.object({
  minScore: z.number().int().min(0).max(1000),
});
export type NotificationSettingsInput = z.output<typeof notificationSettingsInputSchema>;

/** "3 vagas novas com nota alta" / "1 vaga nova com nota alta". */
export function notificationTitle(notification: Pick<NotificationDto, 'jobs'>): string {
  const count = notification.jobs.length;
  return count === 1 ? '1 vaga nova com nota alta' : `${count} vagas novas com nota alta`;
}
