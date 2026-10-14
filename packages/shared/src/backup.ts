/**
 * Backup: um .zip com os dados do app em JSON e os PDFs enviados.
 * Plano: docs/features/18-backup.md
 */

/** Sobe quando o formato do arquivo muda de um jeito que a versão antiga não lê. */
export const BACKUP_FORMAT = 1;

export interface BackupManifest {
  app: 'BuscaVagas';
  format: number;
  createdAt: string;
  /** Migrações do banco de onde saiu (null = não deu para ler). */
  migrations: string[] | null;
  /** Linhas por tabela. */
  counts: Record<string, number>;
}

/** `POST /api/backup/inspect`: o que tem no arquivo, sem mexer em nada. */
export interface BackupInspectDto {
  manifest: BackupManifest;
  /** null = pode restaurar; senão, o motivo (em PT-BR). */
  problem: string | null;
}

/** `POST /api/backup/restore`. */
export interface BackupRestoreResultDto {
  restored: Record<string, number>;
  /** Nome do arquivo com a cópia do que havia antes (na pasta BACKUP_DIR). */
  safetyBackup: string;
}

/** O que mostrar na confirmação: as contagens que importam, com nome em PT-BR. */
export const BACKUP_SUMMARY: readonly [table: string, one: string, many: string][] = [
  ['Job', 'vaga', 'vagas'],
  ['Application', 'candidatura', 'candidaturas'],
  ['ApplicationFile', 'PDF enviado', 'PDFs enviados'],
  ['ResumeItem', 'item do currículo', 'itens do currículo'],
  ['InterviewQuestion', 'pergunta de entrevista', 'perguntas de entrevista'],
  ['TrackedCompany', 'empresa acompanhada', 'empresas acompanhadas'],
];

/** "123 vagas, 9 candidaturas, 2 PDFs enviados…" (o que tem mais de zero). */
export function backupSummary(counts: Record<string, number>): string[] {
  return BACKUP_SUMMARY.flatMap(([table, one, many]) => {
    const count = counts[table] ?? 0;
    return count > 0 ? [`${count} ${count === 1 ? one : many}`] : [];
  });
}
