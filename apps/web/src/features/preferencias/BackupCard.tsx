import { backupSummary, type BackupInspectDto } from '@busca-vagas/shared';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  APPLICATIONS_CSV_URL,
  BACKUP_URL,
  useInspectBackup,
  useRestoreBackup,
} from '../../api/backup';
import { useToast } from '../../components/toast/toast-context';
import { Button } from '../../components/ui/Button';
import { formatDateTime } from '../../lib/format';
import styles from './Preferencias.module.css';

/**
 * Backup (docs/features/18-backup.md): baixar tudo num .zip, exportar as
 * candidaturas em CSV e restaurar um backup (substitui tudo, com confirmação).
 */
export function BackupCard() {
  const inspect = useInspectBackup();
  const restore = useRestoreBackup();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ file: File; info: BackupInspectDto } | null>(null);

  function choose(file: File | undefined) {
    if (!file) return;
    inspect.mutate(file, {
      onSuccess: (info) => setPending({ file, info }),
      onError: (error) => toast.show({ tone: 'error', message: error.message }),
    });
  }

  function confirm() {
    if (!pending) return;
    restore.mutate(pending.file, {
      onSuccess: (result) => {
        setPending(null);
        toast.show({
          tone: 'success',
          message: `Backup restaurado. O que havia antes ficou salvo em backups/${result.safetyBackup}.`,
          duration: 10_000,
        });
      },
      onError: (error) => toast.show({ tone: 'error', message: error.message }),
    });
  }

  const summary = pending ? backupSummary(pending.info.manifest.counts) : [];

  return (
    <section id="backup" className={styles.card} aria-labelledby="backup-titulo">
      <h2 id="backup-titulo" className={styles.cardTitle}>
        Backup
      </h2>
      <p className={styles.hint}>
        Tudo do app num .zip: vagas, candidaturas, currículo, PDFs enviados, perguntas de entrevista
        e preferências. Guarde fora do computador (pendrive, nuvem).
      </p>
      <div className={styles.buttons}>
        <a className={styles.linkButton} href={BACKUP_URL} download>
          <Download size={15} aria-hidden="true" />
          Baixar backup (.zip)
        </a>
        <a className={styles.linkButton} href={APPLICATIONS_CSV_URL} download>
          <FileSpreadsheet size={15} aria-hidden="true" />
          Candidaturas (CSV)
        </a>
      </div>

      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        className="sr-only"
        aria-label="Escolher o .zip do backup"
        onChange={(event) => {
          choose(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {!pending && (
        <Button
          variant="ghost"
          icon={<Upload size={15} aria-hidden="true" />}
          disabled={inspect.isPending}
          onClick={() => input.current?.click()}
        >
          {inspect.isPending ? 'Lendo o arquivo…' : 'Restaurar de um backup…'}
        </Button>
      )}

      {pending && (
        <div className={styles.confirm} role="alertdialog" aria-labelledby="backup-confirma">
          <p id="backup-confirma" className={styles.text}>
            <strong>Backup de {formatDateTime(pending.info.manifest.createdAt)}</strong>
          </p>
          {summary.length > 0 && <p className={styles.text}>{summary.join(', ')}.</p>}
          {pending.info.problem ? (
            <p className={styles.error}>{pending.info.problem}</p>
          ) : (
            <p className={styles.text}>
              Tudo o que está no app agora será <strong>substituído</strong> por este backup. Antes,
              o app guarda uma cópia do estado atual na pasta <code>backups/</code>.
            </p>
          )}
          <div className={styles.buttons}>
            {!pending.info.problem && (
              <Button className={styles.danger} disabled={restore.isPending} onClick={confirm}>
                {restore.isPending ? 'Restaurando…' : 'Substituir tudo pelo backup'}
              </Button>
            )}
            <Button variant="ghost" disabled={restore.isPending} onClick={() => setPending(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
