import type { BackupInspectDto, BackupRestoreResultDto } from '@busca-vagas/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

/** Backup (docs/features/18-backup.md): links de download e restauração. */
export const BACKUP_URL = '/api/backup';
export const APPLICATIONS_CSV_URL = '/api/backup/applications.csv';

const ZIP = 'application/zip';

/** O que tem no .zip (não muda nada). */
export function useInspectBackup() {
  return useMutation({
    mutationFn: (file: Blob) => api.upload<BackupInspectDto>('/backup/inspect', file, ZIP),
  });
}

/** Troca tudo pelo backup; depois, toda tela recarrega da API. */
export function useRestoreBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: Blob) => api.upload<BackupRestoreResultDto>('/backup/restore', file, ZIP),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
