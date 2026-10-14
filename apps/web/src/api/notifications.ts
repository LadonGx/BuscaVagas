import type {
  NotificationSettingsDto,
  NotificationSettingsInput,
  NotificationsDto,
} from '@busca-vagas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { keys } from './keys';

/** O sino confere de minuto em minuto (as buscas rodam de hora em hora). */
export const NOTIFICATIONS_POLL_MS = 60_000;

/** Avisos do sino (docs/features/16-notifications.md). */
export function useNotifications() {
  return useQuery({
    queryKey: keys.notifications,
    queryFn: ({ signal }) => api.get<NotificationsDto>('/notifications', undefined, signal),
    refetchInterval: NOTIFICATIONS_POLL_MS,
  });
}

/** Abriu o sino: tudo lido. */
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<NotificationsDto>('/notifications/read'),
    onSuccess: (data) => queryClient.setQueryData(keys.notifications, data),
  });
}

export function useNotificationSettings() {
  return useQuery({
    queryKey: keys.notificationSettings,
    queryFn: ({ signal }) =>
      api.get<NotificationSettingsDto>('/notifications/settings', undefined, signal),
  });
}

export function useSaveNotificationSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NotificationSettingsInput) =>
      api.put<NotificationSettingsDto>('/notifications/settings', input),
    onSuccess: (data) => queryClient.setQueryData(keys.notificationSettings, data),
  });
}
