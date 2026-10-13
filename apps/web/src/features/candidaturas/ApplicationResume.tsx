import {
  describeResumeChange,
  diffResume,
  RESUME_FILE_MAX_BYTES,
  type ApplicationDetailDto,
  type ResumeChange,
} from '@busca-vagas/shared';
import { Download, FileText, Paperclip, Printer, Trash2 } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  resumeFileUrl,
  useApplicationResume,
  useAttachResumeFile,
  useRemoveResumeFile,
  useSaveApplicationResume,
} from '../../api/applications';
import { useResume } from '../../api/resume';
import { useToast } from '../../components/toast/toast-context';
import { Button } from '../../components/ui/Button';
import { formatDate, formatNumber } from '../../lib/format';
import styles from './ApplicationDrawer.module.css';

/** "245 KB", "1,2 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${formatNumber(Math.max(1, Math.round(bytes / 1024)))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

/**
 * "Currículo enviado" no painel da candidatura (docs/features/14-resume-versions.md):
 * a cópia do currículo do app (ver, imprimir, comparar, guardar o de hoje) e
 * o PDF que você enviou (anexar, baixar, trocar, remover).
 */
export function ApplicationResume({ application }: { application: ApplicationDetailDto }) {
  return (
    <section className={styles.section} aria-labelledby={`curriculo-${application.id}`}>
      <h3 className={styles.label} id={`curriculo-${application.id}`}>
        Currículo enviado
      </h3>
      <ResumeCopy application={application} />
      <ResumeFile application={application} />
    </section>
  );
}

function ResumeCopy({ application }: { application: ApplicationDetailDto }) {
  const { id, resume } = application;
  const save = useSaveApplicationResume(id);
  const toast = useToast();
  const [comparing, setComparing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const saveToday = () =>
    save.mutate(undefined, {
      onSuccess: () => {
        setConfirming(false);
        toast.show({ tone: 'success', message: 'Currículo de hoje guardado nesta candidatura.' });
      },
      onError: (error) => toast.show({ tone: 'error', message: error.message }),
    });

  if (!resume) {
    return (
      <div className={styles.resumeBox}>
        <p className={styles.muted}>
          Sem cópia do currículo do app (candidatura de antes desta função ou currículo vazio).
        </p>
        <div className={styles.buttons}>
          <Button disabled={save.isPending} onClick={saveToday}>
            Guardar o currículo de hoje
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.resumeBox}>
      <div className={styles.resumeHead}>
        <FileText size={18} aria-hidden="true" />
        <span>
          <strong>Currículo do app</strong>
          <span className={styles.muted}>guardado em {formatDate(resume.savedAt)}</span>
        </span>
        <span className={styles.badge} data-tone={resume.sameAsCurrent ? 'good' : 'info'}>
          {resume.sameAsCurrent ? 'Igual ao de hoje' : 'Mudou desde então'}
        </span>
      </div>

      <div className={styles.buttons}>
        <Link className={styles.linkButton} to={`/curriculo/imprimir?candidatura=${id}`}>
          <Printer size={15} aria-hidden="true" />
          Ver e imprimir
        </Link>
        {!resume.sameAsCurrent && (
          <Button variant="ghost" aria-expanded={comparing} onClick={() => setComparing((v) => !v)}>
            {comparing ? 'Esconder diferenças' : 'Comparar com o atual'}
          </Button>
        )}
        {!resume.sameAsCurrent && !confirming && (
          <Button variant="ghost" onClick={() => setConfirming(true)}>
            Guardar o de hoje…
          </Button>
        )}
      </div>

      {confirming && (
        <div className={styles.confirm} role="group" aria-label="Trocar a cópia">
          <p>
            A cópia de {formatDate(resume.savedAt)} será trocada pelo currículo de hoje. Use só se
            você reenviou o currículo nesta candidatura.
          </p>
          <div className={styles.buttons}>
            <Button variant="primary" disabled={save.isPending} onClick={saveToday}>
              Trocar pela de hoje
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {comparing && <ResumeDiff applicationId={id} />}
    </div>
  );
}

function ResumeDiff({ applicationId }: { applicationId: string }) {
  const copy = useApplicationResume(applicationId);
  const current = useResume();

  if (copy.isError || current.isError) {
    return (
      <p className={styles.muted}>
        {(copy.error ?? current.error)?.message ?? 'Erro ao comparar.'}
      </p>
    );
  }
  if (!copy.data || !current.data) return <p className={styles.muted}>Comparando…</p>;

  const changes = diffResume(copy.data.sections, current.data.sections);
  if (changes.length === 0) {
    return <p className={styles.muted}>Só mudanças de ordem ou campos vazios.</p>;
  }
  return (
    <ul className={styles.changes} aria-label="O que mudou desde a candidatura">
      {changes.map((change, index) => (
        <ChangeLine key={index} change={change} />
      ))}
    </ul>
  );
}

function ChangeLine({ change }: { change: ResumeChange }) {
  const detail =
    change.kind === 'item-changed' && (change.before !== null || change.after !== null);
  return (
    <li data-kind={change.kind}>
      <span>{describeResumeChange(change)}</span>
      {detail && (
        <span className={styles.changeDetail}>
          <del>{change.before || '(vazio)'}</del> → <ins>{change.after || '(vazio)'}</ins>
        </span>
      )}
    </li>
  );
}

function ResumeFile({ application }: { application: ApplicationDetailDto }) {
  const { id, resumeFile } = application;
  const attach = useAttachResumeFile(id);
  const remove = useRemoveResumeFile(id);
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [removing, setRemoving] = useState(false);

  const choose = (file: File | undefined) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
      toast.show({ tone: 'error', message: 'Escolha um arquivo PDF.' });
      return;
    }
    if (file.size > RESUME_FILE_MAX_BYTES) {
      toast.show({ tone: 'error', message: 'O PDF passa de 10 MB.' });
      return;
    }
    attach.mutate(file, {
      onSuccess: () => toast.show({ tone: 'success', message: 'PDF anexado à candidatura.' }),
      onError: (error) => toast.show({ tone: 'error', message: error.message }),
    });
  };

  return (
    <div className={styles.resumeBox}>
      {resumeFile ? (
        <div className={styles.resumeHead}>
          <Paperclip size={18} aria-hidden="true" />
          <span>
            <strong>{resumeFile.name}</strong>
            <span className={styles.muted}>
              PDF enviado · {formatFileSize(resumeFile.size)} · anexado em{' '}
              {formatDate(resumeFile.uploadedAt)}
            </span>
          </span>
        </div>
      ) : (
        <p className={styles.muted}>
          Mandou um PDF feito em outro editor? Anexe aqui para saber depois o que você enviou.
        </p>
      )}

      <div className={styles.buttons}>
        {resumeFile && (
          <a className={styles.linkButton} href={resumeFileUrl(id)} download={resumeFile.name}>
            <Download size={15} aria-hidden="true" />
            Baixar
          </a>
        )}
        <input
          ref={input}
          id={inputId}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          aria-label={resumeFile ? 'Trocar o PDF enviado' : 'Anexar o PDF enviado'}
          onChange={(event) => {
            choose(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <Button
          variant={resumeFile ? 'ghost' : 'secondary'}
          icon={resumeFile ? undefined : <Paperclip size={15} aria-hidden="true" />}
          disabled={attach.isPending}
          onClick={() => input.current?.click()}
        >
          {attach.isPending ? 'Enviando…' : resumeFile ? 'Trocar' : 'Anexar o PDF enviado'}
        </Button>
        {resumeFile && !removing && (
          <Button
            variant="ghost"
            icon={<Trash2 size={15} aria-hidden="true" />}
            onClick={() => setRemoving(true)}
          >
            Remover…
          </Button>
        )}
      </div>

      {resumeFile && removing && (
        <div className={styles.confirm} role="group" aria-label="Remover o PDF">
          <p>O PDF sai do app (o arquivo no seu computador continua onde está).</p>
          <div className={styles.buttons}>
            <Button
              variant="primary"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () => setRemoving(false),
                  onError: (error) => toast.show({ tone: 'error', message: error.message }),
                })
              }
            >
              Remover o PDF
            </Button>
            <Button variant="ghost" onClick={() => setRemoving(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
