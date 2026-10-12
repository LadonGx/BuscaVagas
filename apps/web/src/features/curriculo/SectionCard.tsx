import type { ResumeSectionDto } from '@busca-vagas/shared';
import { ArrowDown, ArrowUp, Settings2 } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { useDeleteSection, useRenameSection, useReorderSections } from '../../api/resume';
import { useToast } from '../../components/toast/toast-context';
import { Button } from '../../components/ui/Button';
import { CopyButton } from '../../components/ui/CopyButton';
import { sectionText, withDrafts } from './draft';
import { EntriesSection } from './EntriesSection';
import { FieldsSection } from './FieldsSection';
import { ConfirmDelete, swapped } from './ItemTools';
import { TextSection } from './TextSection';
import type { ResumeDraft } from './useResumeDraft';
import styles from './Section.module.css';

interface SectionCardProps {
  section: ResumeSectionDto;
  index: number;
  sectionIds: string[];
  draft: ResumeDraft;
  organizing: boolean;
  onToggleOrganize: () => void;
}

const BODY = { fields: FieldsSection, text: TextSection, entries: EntriesSection } as const;

/** Uma seção do currículo: título, "Copiar seção", "Organizar" e o conteúdo. */
export function SectionCard({
  section,
  index,
  sectionIds,
  draft,
  organizing,
  onToggleOrganize,
}: SectionCardProps) {
  const headingId = useId();
  const Body = BODY[section.kind];

  return (
    <section
      className={styles.card}
      aria-labelledby={headingId}
      data-organizing={organizing || undefined}
    >
      <div className={styles.head}>
        <h2 id={headingId} className={styles.title}>
          {section.title}
        </h2>
        <div className={styles.headActions}>
          <CopyButton
            text={sectionText(withDrafts(section, draft.drafts))}
            what={`seção ${section.title}`}
          >
            {section.kind === 'text' ? 'Copiar' : 'Copiar seção'}
          </CopyButton>
          <button
            type="button"
            className={styles.textTool}
            aria-pressed={organizing}
            aria-label={`Organizar ${section.title}`}
            onClick={onToggleOrganize}
          >
            <Settings2 size={14} aria-hidden="true" />
            Organizar
          </button>
        </div>
      </div>

      {organizing && (
        <SectionTools
          section={section}
          index={index}
          sectionIds={sectionIds}
          onDeleted={() => draft.discard(section.items.map((item) => item.id))}
        />
      )}

      <Body section={section} draft={draft} organizing={organizing} />
    </section>
  );
}

interface SectionToolsProps {
  section: ResumeSectionDto;
  index: number;
  sectionIds: string[];
  onDeleted: () => void;
}

/** Renomear, mover e apagar a seção. Tudo vai para a API na hora. */
function SectionTools({ section, index, sectionIds, onDeleted }: SectionToolsProps) {
  const rename = useRenameSection();
  const reorder = useReorderSections();
  const remove = useDeleteSection();
  const toast = useToast();
  const [title, setTitle] = useState(section.title);
  const showError = (error: Error) => toast.show({ tone: 'error', message: error.message });
  const trimmed = title.trim();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!trimmed || trimmed === section.title) return;
    rename.mutate(
      { id: section.id, title: trimmed },
      {
        onSuccess: () => toast.show({ tone: 'success', message: 'Seção renomeada.' }),
        onError: showError,
      },
    );
  }

  function move(delta: -1 | 1) {
    reorder.mutate(swapped(sectionIds, index, delta), { onError: showError });
  }

  return (
    <div className={styles.sectionTools}>
      <form className={styles.rename} onSubmit={submit}>
        <input
          className={styles.input}
          aria-label="Nome da seção"
          value={title}
          maxLength={80}
          onChange={(event) => setTitle(event.target.value)}
        />
        <Button type="submit" disabled={!trimmed || trimmed === section.title || rename.isPending}>
          Renomear
        </Button>
      </form>
      <div className={styles.sectionButtons}>
        <button
          type="button"
          className={styles.textTool}
          disabled={index === 0}
          onClick={() => move(-1)}
        >
          <ArrowUp size={14} aria-hidden="true" />
          Subir seção
        </button>
        <button
          type="button"
          className={styles.textTool}
          disabled={index === sectionIds.length - 1}
          onClick={() => move(1)}
        >
          <ArrowDown size={14} aria-hidden="true" />
          Descer seção
        </button>
        <ConfirmDelete
          name={`seção ${section.title}`}
          disabled={remove.isPending}
          onConfirm={() =>
            remove.mutate(section.id, {
              onSuccess: () => {
                onDeleted();
                toast.show({ message: `Seção "${section.title}" apagada.` });
              },
              onError: showError,
            })
          }
        >
          Apagar seção
        </ConfirmDelete>
      </div>
    </div>
  );
}
