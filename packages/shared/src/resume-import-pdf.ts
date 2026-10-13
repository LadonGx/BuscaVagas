import type { ResumeImportLine } from './resume-import';

/**
 * Importar currículo de PDF: dos pedaços de texto que o pdf.js devolve
 * (cada um com posição e fonte) para linhas na ordem de leitura.
 * Geometria pura, sem o pdf.js: dá para testar sem PDF.
 */
export interface PdfTextItem {
  text: string;
  /** Canto esquerdo da linha de base, em pontos (origem embaixo à esquerda). */
  x: number;
  y: number;
  width: number;
  /** Tamanho da fonte, em pontos. */
  size: number;
  bold: boolean;
}

interface Segment {
  items: PdfTextItem[];
  x: number;
  end: number;
  y: number;
  /** Linha visual (mesma altura). Pedaços da mesma linha vão da esquerda para a direita. */
  row: number;
}

/** Nomes de fonte em negrito: "ABCDEF+Calibri-Bold", "Helvetica-Bold", "Inter-SemiBold"... */
export function isBoldFont(name: string | undefined): boolean {
  return /bold|black|heavy|semibold|demi/i.test(name ?? '');
}

/** Agrupa os pedaços na mesma altura; um vão grande na mesma linha separa colunas. */
function segmentsOf(items: readonly PdfTextItem[]): Segment[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: PdfTextItem[][] = [];
  for (const item of sorted) {
    const row = rows.at(-1);
    const tolerance = Math.max(2, item.size * 0.4);
    if (row && Math.abs(row[0]!.y - item.y) <= tolerance) row.push(item);
    else rows.push([item]);
  }

  const segments: Segment[] = [];
  for (const [index, row] of rows.entries()) {
    row.sort((a, b) => a.x - b.x);
    let current: Segment | null = null;
    for (const item of row) {
      const gap = current ? item.x - current.end : 0;
      if (!current || gap > Math.max(24, item.size * 2.5)) {
        current = { items: [item], x: item.x, end: item.x + item.width, y: item.y, row: index };
        segments.push(current);
      } else {
        current.items.push(item);
        current.end = Math.max(current.end, item.x + item.width);
      }
    }
  }
  return segments;
}

/**
 * Procura um "corredor" vertical vazio entre 20% e 80% da largura: é o
 * espaço entre duas colunas. Precisa de texto dos dois lados.
 */
function findGutter(segments: readonly Segment[], pageWidth: number): number | null {
  if (segments.length < 8) return null;
  const step = 4;
  const bins = Math.ceil(pageWidth / step);
  const coverage = new Array<number>(bins).fill(0);
  for (const segment of segments) {
    for (let bin = Math.floor(segment.x / step); bin <= Math.floor(segment.end / step); bin++) {
      if (bin >= 0 && bin < bins) coverage[bin]! += 1;
    }
  }

  // Um ou dois pedaços atravessando (o nome no topo) não desfazem o corredor.
  // Entre os vãos, vale o que tem texto dos dois lados; empate, o mais largo.
  const crossing = Math.max(1, Math.floor(segments.length * 0.06));
  const runs: { start: number; width: number }[] = [];
  let start = -1;
  const last = Math.ceil(bins * 0.8);
  for (let bin = Math.floor(bins * 0.2); bin <= last + 1; bin++) {
    if (bin <= last && coverage[bin]! <= crossing) {
      if (start === -1) start = bin;
    } else if (start !== -1) {
      runs.push({ start, width: bin - start });
      start = -1;
    }
  }

  let best: { split: number; width: number } | null = null;
  for (const run of runs) {
    if (run.width * step < 12) continue;
    const split = (run.start + run.width / 2) * step;
    const left = segments.filter((segment) => segment.end <= split).length;
    const right = segments.filter((segment) => segment.x >= split).length;
    if (left >= 4 && right >= 4 && (!best || run.width > best.width)) {
      best = { split, width: run.width };
    }
  }
  return best?.split ?? null;
}

function toLine(segment: Segment, page: number): ResumeImportLine {
  let text = '';
  let last: PdfTextItem | null = null;
  for (const item of segment.items) {
    // Espaço quando há vão entre os pedaços e nenhum dos dois já tem.
    if (
      last &&
      item.x - (last.x + last.width) > item.size * 0.15 &&
      !/\s$/.test(text) &&
      !/^\s/.test(item.text)
    ) {
      text += ' ';
    }
    text += item.text;
    last = item;
  }
  // Tamanho do pedaço com mais texto (um ícone ou um "•" não decide). Negrito:
  // a linha COMEÇA em negrito ("Sefer Pay (React Native · ...)", "Frontend: React").
  const main = [...segment.items].sort((a, b) => b.text.length - a.text.length)[0]!;
  const first = segment.items.find((item) => item.text.trim().length > 0) ?? main;
  const bold = first.bold && (first.text.trim().length >= 3 || main.bold);
  return { text: text.replace(/\s+/g, ' ').trim(), size: main.size, bold, page };
}

/**
 * Pedaços de uma página → linhas na ordem de leitura. Com duas colunas, a
 * da esquerda inteira vem antes da da direita (o que atravessa o corredor,
 * como o nome no topo, entra antes das duas).
 */
export function pdfItemsToLines(
  items: readonly PdfTextItem[],
  pageWidth: number,
  page = 1,
): ResumeImportLine[] {
  const segments = segmentsOf(items.filter((item) => item.text.trim().length > 0));
  const gutter = findGutter(segments, pageWidth);
  // Pela linha visual, não pelo y exato: o texto menor alinhado à direita
  // ("Americana, SP   Jul 2025 – Abr 2026") tem a base um pouco mais alta e
  // passaria na frente do cargo/empresa da mesma linha.
  const byTop = (a: Segment, b: Segment) => a.row - b.row || a.x - b.x;

  if (gutter === null) return segments.sort(byTop).map((segment) => toLine(segment, page));

  const spanning = segments.filter((s) => s.x < gutter && s.end > gutter).sort(byTop);
  const left = segments.filter((s) => s.end <= gutter).sort(byTop);
  const right = segments.filter((s) => s.x >= gutter).sort(byTop);
  return [...spanning, ...left, ...right].map((segment) => toLine(segment, page));
}
