import type { TextItem } from '@busca-vagas/shared';
import { Plus } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { useAddItem } from '../../api/resume';
import { useToast } from '../../components/toast/toast-context';
import { Button } from '../../components/ui/Button';
import { CopyButton } from '../../components/ui/CopyButton';
import { formatNumber } from '../../lib/format';
import type { SectionBodyProps } from './FieldsSection';
import { ItemTools } from './ItemTools';
import styles from './Section.module.css';

/** Bloco de texto livre (Resumo). A seção costuma ter um item só. */
export function TextSection({ section, draft, organizing }: SectionBodyProps) {
  const add = useAddItem();
  const toast = useToast();
  const many = section.items.length > 1;

  if (section.items.length === 0) {
    return (
      <Button
        variant="ghost"
        className={styles.add}
        icon={<Plus size={16} aria-hidden="true" />}
        disabled={add.isPending}
        onClick={() =>
          add.mutate(
            { sectionId: section.id, data: { text: '' } },
            { onError: (error) => toast.show({ tone: 'error', message: error.message }) },
          )
        }
      >
        Adicionar texto
      </Button>
    );
  }

  return (
    <>
      {section.items.map((item, index) => {
        const data = (draft.drafts[item.id] ?? item.data) as TextItem;
        const name = many ? `${section.title} ${index + 1}` : section.title;
        return (
          <TextBlock
            key={item.id}
            name={name}
            value={data.text}
            error={draft.errors[item.id]?.text}
            dirty={draft.isDirty(item.id)}
            showCopy={many}
            onChange={(text) => draft.edit(item.id, { text })}
            tools={
              organizing && (
                <ItemTools
                  section={section}
                  index={index}
                  name={name}
                  onDeleted={() => draft.discard([item.id])}
                />
              )
            }
          />
        );
      })}
    </>
  );
}

interface TextBlockProps {
  name: string;
  value: string;
  error?: string;
  dirty: boolean;
  showCopy: boolean;
  onChange: (text: string) => void;
  tools: ReactNode;
}

function TextBlock({ name, value, error, dirty, showCopy, onChange, tools }: TextBlockProps) {
  const id = useId();
  const length = value.trim().length;

  return (
    <div className={styles.textBlock} data-dirty={dirty || undefined}>
      <textarea
        id={id}
        className={styles.text}
        rows={5}
        aria-label={name}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-info`}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className={styles.textFooter}>
        <span id={`${id}-info`} className={error ? styles.error : styles.muted}>
          {error ?? `${formatNumber(length)} ${length === 1 ? 'caractere' : 'caracteres'}`}
          {dirty && ' · não salvo'}
        </span>
        {showCopy && <CopyButton text={value.trim()} what={name} />}
      </div>
      {tools}
    </div>
  );
}
