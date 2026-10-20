import {
  formatPeriod,
  type EntryItem,
  type FieldItem,
  type ResumeSectionDto,
  type TextItem,
} from '@busca-vagas/shared';
import { ArrowLeft, Printer } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useApplication, useApplicationResume } from '../../api/applications';
import { useResume } from '../../api/resume';
import { Button } from '../../components/ui/Button';
import { formatDate } from '../../lib/format';
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

/**
 * Currículo em página A4. "Salvar como PDF" usa a impressão do navegador.
 * `?candidatura=<id>`: a cópia guardada naquela candidatura, não o currículo
 * de hoje (docs/features/14-resume-versions.md).
 */
export function ImprimirPage() {
  const [params] = useSearchParams();
  const applicationId = params.get('candidatura');
  const current = useResume();
  const copy = useApplicationResume(applicationId ?? '', Boolean(applicationId));
  const application = useApplication(applicationId);
  const { data, isPending, isError, error } = applicationId ? copy : current;
  const { choices, choose } = usePdfChoices();
  const sections = data?.sections ?? [];
  const doc = buildDocument(sections, choices);
  const [fit, setFit] = useState<FitResult | null>(null);

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
        <Link
          to={applicationId ? `/candidaturas/${applicationId}` : '/curriculo'}
          className={styles.back}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          {applicationId ? 'Voltar à candidatura' : 'Voltar ao currículo'}
        </Link>
        {applicationId && copy.data && (
          <p className={styles.version}>
            <strong>Versão enviada em {formatDate(copy.data.savedAt)}</strong>
            {application.data && (
              <span>
                {application.data.job.title} · {application.data.job.company}
              </span>
            )}
          </p>
        )}
        <Button
          variant="primary"
          icon={<Printer size={16} aria-hidden="true" />}
          disabled={!data}
          onClick={() => window.print()}
        >
          Salvar como PDF
        </Button>
        {fit && fit.pages > 1 && (
          <p className={styles.warning} role="alert">
            Passa de 1 página ({fit.pages} páginas) mesmo com a letra no mínimo. Desmarque seções ou
            encurte as descrições: muitos ATS recusam currículo com mais de uma página.
          </p>
        )}
        {fit && fit.pages === 1 && fit.size < FONT_SIZES_PT[0]! && (
          <p className={styles.hint}>Letra reduzida para {fit.size} pt para caber em 1 página.</p>
        )}
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
        {data && <Paper doc={doc} onFit={setFit} />}
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

/**
 * Uma página, sempre que der: o tamanho da letra desce de 10,5 pt até 9 pt
 * até o conteúdo caber na área útil da A4 (as margens do `@page` no CSS).
 * Os tamanhos da folha estão em `em`, então tudo encolhe junto.
 */
export const FONT_SIZES_PT = [10.5, 10, 9.5, 9] as const;
/** A4 menos as margens de cima e de baixo do `@page` (12 mm cada). */
export const PRINT_HEIGHT_MM = 297 - 2 * 12;

export interface FitResult {
  size: number;
  pages: number;
}

const mmToPx = (mm: number) => (mm * 96) / 25.4;

/** Ajusta a letra da folha e diz quantas páginas sobram. Mexe só no DOM. */
export function fitToOnePage(paper: HTMLElement, content: HTMLElement): FitResult {
  const limit = mmToPx(PRINT_HEIGHT_MM);
  let height = 0;
  for (const size of FONT_SIZES_PT) {
    paper.style.fontSize = `${size}pt`;
    height = content.getBoundingClientRect().height;
    if (height <= limit + 1) return { size, pages: 1 };
  }
  return { size: FONT_SIZES_PT.at(-1)!, pages: Math.ceil(height / limit) };
}

/** Linhas que começam com "-", "•", "*" ou "–" viram lista; o resto, parágrafo. */
export function splitDescription(text: string): { bullets: string[]; paragraphs: string[] }[] {
  const groups: { bullets: string[]; paragraphs: string[] }[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = /^[-•*–]\s+(.*)$/.exec(line);
    const last = groups.at(-1);
    if (bullet) {
      if (last && last.paragraphs.length === 0) last.bullets.push(bullet[1]!);
      else groups.push({ bullets: [bullet[1]!], paragraphs: [] });
    } else if (last && last.bullets.length === 0) last.paragraphs.push(line);
    else groups.push({ bullets: [], paragraphs: [line] });
  }
  return groups;
}

export const isProjectSection = (title: string) =>
  /\bproje(to|ct)s?\b/.test(title.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase());

function Description({ text }: { text: string }) {
  return splitDescription(text).map((group, index) =>
    group.bullets.length > 0 ? (
      <ul key={index} className={styles.docBullets}>
        {group.bullets.map((bullet, item) => (
          <li key={item}>{bullet}</li>
        ))}
      </ul>
    ) : (
      group.paragraphs.map((paragraph, item) => (
        <p key={`${index}-${item}`} className={styles.docText}>
          {paragraph}
        </p>
      ))
    ),
  );
}

/**
 * A folha no formato que os ATS leem bem: uma coluna, fonte padrão (Times),
 * texto de verdade (nada de imagem), títulos simples e cada experiência com
 * empresa, local e período na mesma linha e o cargo embaixo.
 */
function Paper({ doc, onFit }: { doc: PrintDocument; onFit: (fit: FitResult) => void }) {
  const paperRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const signature = JSON.stringify(doc);

  useLayoutEffect(() => {
    const paper = paperRef.current;
    const content = contentRef.current;
    if (!paper || !content) return;
    const fit = () => {
      const result = fitToOnePage(paper, content);
      // O gerador do PDF (pnpm candidatar) espera por isto.
      paper.dataset.pronto = 'sim';
      onFit(result);
    };
    fit();
    // A fonte da tela pode chegar depois e mudar a altura.
    void document.fonts?.ready.then(fit);
  }, [signature, onFit]);

  return (
    <article ref={paperRef} className={styles.paper} aria-label="Prévia do currículo">
      <div ref={contentRef}>
        <header className={styles.docHeader}>
          <h1 className={styles.name}>{doc.name ?? 'Currículo'}</h1>
          {doc.contact.length > 0 && <p className={styles.contact}>{doc.contact.join(' · ')}</p>}
        </header>

        {doc.blocks.length === 0 && (
          <p className={styles.emptyDoc}>
            Nada para mostrar: preencha o currículo ou marque seções.
          </p>
        )}

        {doc.blocks.map((block) => (
          <section key={block.id} className={styles.docSection}>
            <h2 className={styles.docTitle}>{block.title}</h2>
            {block.kind === 'fields' &&
              block.fields.map((field) => (
                <p key={field.id} className={styles.docField}>
                  <strong>{field.label}:</strong> {field.value}
                </p>
              ))}
            {block.kind === 'text' &&
              block.paragraphs.map((text, index) => (
                <p key={index} className={styles.docSummary}>
                  {text}
                </p>
              ))}
            {block.kind === 'entries' &&
              block.entries.map((entry, index) => {
                // Projeto: o nome em negrito e o contexto entre parênteses.
                // Experiência e formação: a empresa em negrito e o cargo embaixo.
                const project = isProjectSection(block.title);
                return (
                  <div key={index} className={styles.docEntry}>
                    <div className={styles.docEntryHead}>
                      <p>
                        <strong>
                          {project ? entry.title : (entry.organization ?? entry.title)}
                        </strong>
                        {project && entry.organization && ` (${entry.organization})`}
                      </p>
                      <span>
                        {[entry.location, formatPeriod(entry)].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    {!project && entry.organization && (
                      <p className={styles.docRole}>{entry.title}</p>
                    )}
                    {entry.description && <Description text={entry.description} />}
                  </div>
                );
              })}
          </section>
        ))}
      </div>
    </article>
  );
}
