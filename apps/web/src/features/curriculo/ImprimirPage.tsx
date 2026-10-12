import {
  formatPeriod,
  type EntryItem,
  type FieldItem,
  type ResumeSectionDto,
  type TextItem,
} from '@busca-vagas/shared';
import { ArrowLeft, Printer } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router';
import { useResume } from '../../api/resume';
import { Button } from '../../components/ui/Button';
import { normalizeItem } from './draft';
import { fieldShown, findName, sectionShown, usePdfChoices, type PdfChoices } from './pdfChoices';
import styles from './ImprimirPage.module.css';

interface PrintField {
  id: string;
  label: string;
  value: string;
}

type PrintBlock = { id: string; title: string } & (
  | { kind: 'fields'; fields: PrintField[] }
  | { kind: 'text'; paragraphs: string[] }
  | { kind: 'entries'; entries: EntryItem[] }
);

export interface PrintDocument {
  name: string | null;
  /** Valores das seções de campos do topo (cidade, e-mail, links), numa linha. */
  contact: string[];
  blocks: PrintBlock[];
}

function filledFields(section: ResumeSectionDto): PrintField[] {
  return section.items.flatMap((item) => {
    const field = normalizeItem('fields', item.data) as FieldItem;
    return field.value ? [{ id: item.id, label: field.label, value: field.value }] : [];
  });
}

/**
 * O que vai para a página. As seções de campos que vêm antes de qualquer
 * texto ou entrada (Dados pessoais, Contato, Links) viram a linha de contato
 * embaixo do nome; o resto vira um bloco por seção. Vazio não aparece.
 */
export function buildDocument(
  sections: readonly ResumeSectionDto[],
  choices: PdfChoices,
): PrintDocument {
  const nameField = findName(sections);
  const name = nameField && fieldShown(choices, nameField.id, 'Nome') ? nameField.value : null;
  const contact: string[] = [];
  const blocks: PrintBlock[] = [];
  let inTop = true;

  for (const section of sections) {
    if (section.kind !== 'fields') inTop = false;
    if (!sectionShown(choices, section)) continue;

    if (section.kind === 'fields') {
      const fields = filledFields(section).filter(
        (field) => field.id !== nameField?.id && fieldShown(choices, field.id, field.label),
      );
      if (inTop) contact.push(...fields.map((field) => field.value));
      else if (fields.length > 0) {
        blocks.push({ id: section.id, title: section.title, kind: 'fields', fields });
      }
    } else if (section.kind === 'text') {
      const paragraphs = section.items
        .map((item) => (normalizeItem('text', item.data) as TextItem).text)
        .filter(Boolean);
      if (paragraphs.length > 0) {
        blocks.push({ id: section.id, title: section.title, kind: 'text', paragraphs });
      }
    } else {
      const entries = section.items
        .map((item) => normalizeItem('entries', item.data) as EntryItem)
        .filter((entry) => entry.title);
      if (entries.length > 0) {
        blocks.push({ id: section.id, title: section.title, kind: 'entries', entries });
      }
    }
  }

  return { name, contact, blocks };
}

/** Currículo em página A4. "Salvar como PDF" usa a impressão do navegador. */
export function ImprimirPage() {
  const { data, isPending, isError, error } = useResume();
  const { choices, choose } = usePdfChoices();
  const sections = data?.sections ?? [];
  const doc = buildDocument(sections, choices);

  // O título da aba vira o nome sugerido do arquivo PDF.
  useEffect(() => {
    const previous = document.title;
    document.title = doc.name ? `Currículo — ${doc.name}` : 'Currículo';
    return () => {
      document.title = previous;
    };
  }, [doc.name]);

  return (
    <div className={styles.screen}>
      <aside className={styles.panel} aria-label="Opções do PDF">
        <Link to="/curriculo" className={styles.back}>
          <ArrowLeft size={16} aria-hidden="true" />
          Voltar ao currículo
        </Link>
        <Button
          variant="primary"
          icon={<Printer size={16} aria-hidden="true" />}
          disabled={!data}
          onClick={() => window.print()}
        >
          Salvar como PDF
        </Button>
        <p className={styles.hint}>
          Na janela de impressão, escolha <strong>Salvar como PDF</strong> no destino e desmarque{' '}
          <strong>Cabeçalhos e rodapés</strong> para tirar a data e o endereço da página.
        </p>

        {sections.length > 0 && (
          <fieldset className={styles.choices}>
            <legend className={styles.legend}>O que entra no PDF</legend>
            {sections.map((section) => (
              <SectionChoice key={section.id} section={section} choices={choices} choose={choose} />
            ))}
          </fieldset>
        )}
      </aside>

      <div className={styles.stage}>
        {isPending && <p className={styles.hint}>Carregando currículo…</p>}
        {isError && <p className={styles.hint}>{error.message}</p>}
        {data && <Paper doc={doc} />}
      </div>
    </div>
  );
}

function SectionChoice({
  section,
  choices,
  choose,
}: {
  section: ResumeSectionDto;
  choices: PdfChoices;
  choose: (id: string, shown: boolean) => void;
}) {
  const shown = sectionShown(choices, section);
  const fields = section.kind === 'fields' ? filledFields(section) : [];

  return (
    <div className={styles.choice}>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={shown}
          onChange={(event) => choose(section.id, event.target.checked)}
        />
        {section.title}
      </label>
      {fields.length > 0 && (
        <div className={styles.subChoices}>
          {fields.map((field) => (
            <label key={field.id} className={styles.check}>
              <input
                type="checkbox"
                checked={fieldShown(choices, field.id, field.label)}
                disabled={!shown}
                onChange={(event) => choose(field.id, event.target.checked)}
              />
              {field.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function Paper({ doc }: { doc: PrintDocument }) {
  return (
    <article className={styles.paper} aria-label="Prévia do currículo">
      <header className={styles.docHeader}>
        <h1 className={styles.name}>{doc.name ?? 'Currículo'}</h1>
        {doc.contact.length > 0 && <p className={styles.contact}>{doc.contact.join(' · ')}</p>}
      </header>

      {doc.blocks.length === 0 && (
        <p className={styles.emptyDoc}>Nada para mostrar: preencha o currículo ou marque seções.</p>
      )}

      {doc.blocks.map((block) => (
        <section key={block.id} className={styles.docSection}>
          <h2 className={styles.docTitle}>{block.title}</h2>
          {block.kind === 'fields' && (
            <dl className={styles.docFields}>
              {block.fields.map((field) => (
                <div key={field.id}>
                  <dt>{field.label}:</dt>
                  <dd>{field.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {block.kind === 'text' &&
            block.paragraphs.map((text, index) => (
              <p key={index} className={styles.docText}>
                {text}
              </p>
            ))}
          {block.kind === 'entries' &&
            block.entries.map((entry, index) => (
              <div key={index} className={styles.docEntry}>
                <div className={styles.docEntryHead}>
                  <p>
                    <strong>{entry.title}</strong>
                    {entry.organization && ` — ${entry.organization}`}
                    {entry.location && <span className={styles.docMuted}> · {entry.location}</span>}
                  </p>
                  <span className={styles.docMuted}>{formatPeriod(entry)}</span>
                </div>
                {entry.description && <p className={styles.docText}>{entry.description}</p>}
              </div>
            ))}
        </section>
      ))}
    </article>
  );
}
