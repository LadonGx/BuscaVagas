import {
  buildImportPlan,
  formatPeriod,
  parseResumeLines,
  planToApplyInput,
  type ImportChange,
  type ImportSectionKey,
  type ResumeDto,
  type ResumeImportDraft,
  type ResumeImportLine,
} from '@busca-vagas/shared';
import { FileUp } from 'lucide-react';
import { useId, useRef, useState, type ChangeEvent } from 'react';
import { useImportResume } from '../../../api/resume';
import { useToast } from '../../../components/toast/toast-context';
import { Button } from '../../../components/ui/Button';
import { Drawer } from '../../../components/ui/Drawer';
import { PdfReadError, readPdfLines } from './readPdf';
import styles from './ImportDialog.module.css';

const SECTION_NAMES: Record<ImportSectionKey, string> = {
  contact: 'Contato',
  summary: 'Resumo',
  experience: 'Experiência',
  education: 'Formação',
  projects: 'Projetos',
  skills: 'Competências',
  languages: 'Idiomas',
  courses: 'Cursos',
  other: 'outras',
};

/** "Achei: nome, contato, Resumo, Experiência (2)..." — o que o importador reconheceu. */
export function foundSummary(draft: ResumeImportDraft): string {
  const parts: string[] = [];
  if (draft.name) parts.push('nome');
  if (Object.values(draft.contact).some(Boolean)) parts.push('contato');
  const counts: Partial<Record<ImportSectionKey, number>> = {
    experience: draft.experience.length,
    education: draft.education.length,
    projects: draft.projects.length,
    courses: draft.courses.length,
  };
  for (const { key, title } of draft.found) {
    if (key === 'contact') continue;
    const name = key === 'other' ? title : SECTION_NAMES[key];
    const count = counts[key];
    parts.push(count ? `${name} (${count})` : name);
  }
  return parts.length
    ? `Achei: ${[...new Set(parts)].join(', ')}.`
    : 'Não reconheci nenhuma seção.';
}

/** Mudanças agrupadas pela seção de destino, na ordem em que aparecem. */
export function groupChanges(changes: readonly ImportChange[]) {
  const groups: { title: string; isNew: boolean; changes: ImportChange[] }[] = [];
  for (const change of changes) {
    const group = groups.find((item) => item.title === change.sectionTitle);
    if (group) group.changes.push(change);
    else
      groups.push({
        title: change.sectionTitle,
        isNew: change.sectionId === null,
        changes: [change],
      });
  }
  return groups;
}

type Step =
  | { name: 'pick'; error: string | null }
  | { name: 'reading'; file: string }
  | {
      name: 'review';
      file: string;
      lines: ResumeImportLine[];
      draft: ResumeImportDraft;
      changes: ImportChange[];
    };

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  resume: ResumeDto;
}

/**
 * Importar de PDF: escolher o arquivo → ler no navegador → revisar → aplicar.
 * Plano: docs/features/12-resume-import.md
 */
export function ImportDialog({ open, onClose, resume }: ImportDialogProps) {
  const [step, setStep] = useState<Step>({ name: 'pick', error: null });
  const apply = useImportResume();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  function close() {
    setStep({ name: 'pick', error: null });
    apply.reset();
    onClose();
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setStep({ name: 'reading', file: file.name });
    try {
      const lines = await readPdfLines(file);
      const draft = parseResumeLines(lines);
      setStep({
        name: 'review',
        file: file.name,
        lines,
        draft,
        changes: buildImportPlan(resume, draft),
      });
    } catch (error) {
      // Erro inesperado (bug do leitor, PDF estranho): o detalhe fica no console.
      if (!(error instanceof PdfReadError)) console.error('Importar de PDF:', error);
      setStep({
        name: 'pick',
        error:
          error instanceof PdfReadError
            ? error.message
            : 'Não consegui ler este PDF. Tente outro arquivo.',
      });
    }
  }

  const changes = step.name === 'review' ? step.changes : [];
  const selected = changes.filter((change) => change.selected).length;
  /** Entrada marcada sem título: a API recusaria. */
  const missingTitle = changes.some(
    (change) => change.selected && change.type === 'entry' && !change.data.title.trim(),
  );

  function update(id: string, patch: (change: ImportChange) => ImportChange) {
    setStep((current) =>
      current.name === 'review'
        ? {
            ...current,
            changes: current.changes.map((change) => (change.id === id ? patch(change) : change)),
          }
        : current,
    );
  }

  function submit() {
    apply.mutate(planToApplyInput(changes), {
      onSuccess: () => {
        toast.show({
          tone: 'success',
          message: `Currículo atualizado com ${selected} ${selected === 1 ? 'item' : 'itens'} do PDF.`,
        });
        close();
      },
    });
  }

  const picker = (
    <input
      ref={inputRef}
      id={inputId}
      type="file"
      accept="application/pdf,.pdf"
      aria-label="Arquivo PDF do currículo"
      tabIndex={-1}
      className="sr-only"
      onChange={(event) => void onFile(event)}
    />
  );

  return (
    <Drawer
      open={open}
      onClose={close}
      title="Importar de PDF"
      size="wide"
      footer={
        step.name === 'review' && (
          <>
            <Button
              variant="primary"
              disabled={selected === 0 || missingTitle || apply.isPending}
              onClick={submit}
            >
              {apply.isPending
                ? 'Aplicando…'
                : `Aplicar ${selected} ${selected === 1 ? 'mudança' : 'mudanças'}`}
            </Button>
            <Button onClick={() => inputRef.current?.click()}>Outro PDF</Button>
            <Button variant="ghost" onClick={close}>
              Cancelar
            </Button>
          </>
        )
      }
    >
      {picker}

      {step.name === 'pick' && (
        <div className={styles.pick}>
          <p className={styles.muted}>
            O PDF é lido aqui no navegador — o arquivo não é enviado para lugar nenhum. Depois você
            revisa o que foi encontrado; nada é gravado antes de "Aplicar".
          </p>
          <p className={styles.muted}>
            Funciona com PDF exportado do Word, Google Docs, Canva ou LinkedIn. PDF escaneado
            (imagem) não tem texto para ler.
          </p>
          <Button
            variant="primary"
            icon={<FileUp size={16} aria-hidden="true" />}
            onClick={() => inputRef.current?.click()}
          >
            Escolher o PDF
          </Button>
          {step.error && (
            <p className={styles.error} role="alert">
              {step.error}
            </p>
          )}
        </div>
      )}

      {step.name === 'reading' && (
        <p className={styles.muted} role="status">
          Lendo {step.file}…
        </p>
      )}

      {step.name === 'review' && (
        <div className={styles.review}>
          <p className={styles.summary}>
            <strong>{step.file}</strong> · {foundSummary(step.draft)}
          </p>
          <p className={styles.muted}>
            Marcado = vai entrar. Campo que você já preencheu vem desmarcado, com o valor atual ao
            lado. Dá para corrigir o texto aqui; datas e descrições, depois, no próprio currículo.
          </p>
          {missingTitle && (
            <p className={styles.error} role="alert">
              Uma experiência marcada está sem título: preencha ou desmarque.
            </p>
          )}
          {apply.isError && (
            <p className={styles.error} role="alert">
              {apply.error.message}
            </p>
          )}

          {changes.length === 0 ? (
            <p className={styles.empty}>
              Nada novo para trazer: o que achei no PDF já está no currículo (ou não reconheci as
              seções — veja o texto lido abaixo).
            </p>
          ) : (
            groupChanges(changes).map((group) => (
              <section key={group.title} className={styles.group} aria-label={group.title}>
                <h3 className={styles.groupTitle}>
                  {group.title}
                  {group.isNew && <span className={styles.badge}>seção nova</span>}
                </h3>
                <ul className={styles.list}>
                  {group.changes.map((change) => (
                    <ChangeRow key={change.id} change={change} onChange={update} />
                  ))}
                </ul>
              </section>
            ))
          )}

          <details className={styles.raw}>
            <summary>Ver o texto lido do PDF ({step.lines.length} linhas)</summary>
            <pre>{step.lines.map((line) => line.text).join('\n')}</pre>
          </details>
        </div>
      )}
    </Drawer>
  );
}

interface ChangeRowProps {
  change: ImportChange;
  onChange: (id: string, patch: (change: ImportChange) => ImportChange) => void;
}

function ChangeRow({ change, onChange }: ChangeRowProps) {
  const id = useId();
  const toggle = () =>
    onChange(change.id, (current) => ({ ...current, selected: !current.selected }));
  const label =
    change.type === 'field' ? change.label : change.type === 'text' ? 'Texto' : change.data.title;

  return (
    <li className={styles.row} data-off={!change.selected || undefined}>
      <input
        id={id}
        type="checkbox"
        className={styles.check}
        checked={change.selected}
        onChange={toggle}
        aria-label={`Importar: ${label}`}
      />
      <div className={styles.body}>
        {change.type === 'field' && (
          <>
            <label htmlFor={`${id}-valor`} className={styles.label}>
              {change.label}
              {!change.itemId && <span className={styles.badge}>campo novo</span>}
            </label>
            <input
              id={`${id}-valor`}
              className={styles.input}
              value={change.incoming}
              onChange={(event) =>
                onChange(change.id, (current) => ({
                  ...current,
                  incoming: event.target.value,
                  selected: true,
                }))
              }
            />
            {change.current && <p className={styles.current}>Agora: {change.current}</p>}
          </>
        )}

        {change.type === 'text' && (
          <>
            <label htmlFor={`${id}-texto`} className={styles.label}>
              Texto
            </label>
            <textarea
              id={`${id}-texto`}
              className={styles.textarea}
              rows={4}
              value={change.incoming}
              onChange={(event) =>
                onChange(change.id, (current) => ({
                  ...current,
                  incoming: event.target.value,
                  selected: true,
                }))
              }
            />
            {change.current && <p className={styles.current}>Agora: {change.current}</p>}
          </>
        )}

        {change.type === 'entry' && (
          <>
            <div className={styles.entryFields}>
              <label className={styles.label}>
                Título
                <input
                  className={styles.input}
                  value={change.data.title}
                  onChange={(event) =>
                    onChange(change.id, (current) =>
                      current.type === 'entry'
                        ? { ...current, data: { ...current.data, title: event.target.value } }
                        : current,
                    )
                  }
                />
              </label>
              <label className={styles.label}>
                Organização
                <input
                  className={styles.input}
                  value={change.data.organization ?? ''}
                  onChange={(event) =>
                    onChange(change.id, (current) =>
                      current.type === 'entry'
                        ? {
                            ...current,
                            data: { ...current.data, organization: event.target.value || null },
                          }
                        : current,
                    )
                  }
                />
              </label>
            </div>
            <p className={styles.meta}>
              {[formatPeriod(change.data), change.data.location].filter(Boolean).join(' · ') ||
                'Sem período'}
              {change.duplicate && <span className={styles.badge}>já existe no currículo</span>}
            </p>
            {change.data.description && (
              <p className={styles.description}>{change.data.description}</p>
            )}
          </>
        )}
      </div>
    </li>
  );
}
