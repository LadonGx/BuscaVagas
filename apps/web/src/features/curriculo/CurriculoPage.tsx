import { FileDown, FileText, Upload } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useResume } from '../../api/resume';
import { useToast } from '../../components/toast/toast-context';
import { unsavedLabel, useUnsavedChanges } from '../../components/UnsavedChanges';
import { Button } from '../../components/ui/Button';
import { CopyButton } from '../../components/ui/CopyButton';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { AddSection } from './AddSection';
import { resumeText } from './draft';
import { SectionCard } from './SectionCard';
import { useResumeDraft, type SaveOutcome } from './useResumeDraft';
import styles from './CurriculoPage.module.css';

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/** Uma mensagem para o resultado de "Salvar". */
export function saveMessage(outcome: SaveOutcome): { tone: 'success' | 'error'; message: string } {
  const problems: string[] = [];
  if (outcome.invalid > 0) {
    problems.push(
      `${outcome.invalid} ${plural(outcome.invalid, 'item tem erro', 'itens têm erro')} — corrija os campos marcados`,
    );
  }
  const [firstFailure] = outcome.failed;
  if (firstFailure) {
    const count = outcome.failed.length;
    problems.push(
      `${count} ${plural(count, 'item não foi salvo', 'itens não foram salvos')} (${firstFailure.error.message})`,
    );
  }
  if (problems.length === 0) return { tone: 'success', message: 'Currículo salvo.' };
  const saved =
    outcome.saved === 0
      ? ''
      : outcome.saved === 1
        ? ' O outro foi salvo.'
        : ` Os outros ${outcome.saved} foram salvos.`;
  return { tone: 'error', message: `${problems.join('; ')}.${saved}` };
}

export function CurriculoPage() {
  const { data: resume, isPending, isError, error } = useResume();
  const draft = useResumeDraft(resume);
  const toast = useToast();
  const navigate = useNavigate();
  const [organizing, setOrganizing] = useState<string | null>(null);
  const dirty = draft.dirtyCount > 0;

  async function save(): Promise<boolean> {
    if (draft.saving) return false;
    if (!dirty) return true;
    const outcome = await draft.saveAll();
    const result = saveMessage(outcome);
    toast.show(result);
    return result.tone === 'success';
  }

  const unsaved = useUnsavedChanges({ count: draft.dirtyCount, saving: draft.saving, save });

  async function openPrint() {
    if (!(await save())) return;
    unsaved.allowNextLeave();
    void navigate('/curriculo/imprimir');
  }

  const sections = resume?.sections ?? [];
  const status = draft.saving
    ? 'Salvando…'
    : dirty
      ? `${unsavedLabel(draft.dirtyCount)} · Ctrl+S salva`
      : '';

  return (
    <div className={styles.page}>
      <div className={styles.sticky}>
        <PageHeader
          title="Currículo"
          subtitle={
            <>
              Preencha uma vez e copie cada campo no formulário da vaga.
              <span className={styles.status} role="status">
                {status}
              </span>
            </>
          }
          actions={
            resume && (
              <>
                <CopyButton
                  className={styles.headerCopy}
                  text={resumeText(sections, draft.drafts).trim()}
                  what="currículo inteiro"
                >
                  Copiar tudo
                </CopyButton>
                <Button icon={<FileDown size={16} aria-hidden="true" />} onClick={openPrint}>
                  Ver e salvar PDF
                </Button>
                <Button variant="primary" disabled={!dirty || draft.saving} onClick={save}>
                  {draft.saving ? 'Salvando…' : 'Salvar'}
                </Button>
              </>
            )
          }
        />
      </div>

      <section className={styles.import} aria-label="Importar de PDF">
        <div className={styles.importIcon}>
          <Upload size={20} aria-hidden="true" />
        </div>
        <div className={styles.importText}>
          <strong>Importar de PDF</strong>
          <span className={styles.muted}>
            Vai ler o seu currículo em PDF e preencher os campos abaixo, para você revisar antes de
            salvar.
          </span>
        </div>
        <Button disabled aria-describedby="importar-fase-3">
          Escolher arquivo
        </Button>
        <span id="importar-fase-3" className={styles.soon}>
          Chega na Fase 3
        </span>
      </section>

      {isPending && <p className={styles.muted}>Carregando currículo…</p>}
      {isError && (
        <EmptyState
          icon={<FileText size={22} aria-hidden="true" />}
          title="Não deu para abrir o currículo"
        >
          {error.message}
        </EmptyState>
      )}

      {sections.map((section, index) => (
        <SectionCard
          key={section.id}
          section={section}
          index={index}
          sectionIds={sections.map((entry) => entry.id)}
          draft={draft}
          organizing={organizing === section.id}
          onToggleOrganize={() =>
            setOrganizing((current) => (current === section.id ? null : section.id))
          }
        />
      ))}

      {resume && <AddSection />}

      {unsaved.dialog}
    </div>
  );
}
