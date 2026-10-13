import {
  isBoldFont,
  pdfItemsToLines,
  type PdfTextItem,
  type ResumeImportLine,
} from '@busca-vagas/shared';

/** Maior que isso não é currículo (e travaria o navegador à toa). */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_PAGES = 6;

/** Erro com mensagem pronta para a tela. */
export class PdfReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfReadError';
  }
}

/**
 * Lê o texto de um PDF no navegador (o arquivo não vai para a API) e
 * devolve as linhas na ordem de leitura. O pdf.js só é carregado aqui,
 * quando alguém importa — não pesa na abertura do app.
 */
export async function readPdfLines(file: File): Promise<ResumeImportLine[]> {
  if (file.size > MAX_PDF_BYTES) {
    throw new PdfReadError('Arquivo grande demais (máximo 10 MB).');
  }
  const looksPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!looksPdf) throw new PdfReadError('Escolha um arquivo .pdf.');

  // Build "legacy": a normal usa recursos de JavaScript que navegadores de
  // poucos meses atrás ainda não têm (Map.getOrInsertComputed).
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), verbosity: 0 });
  let doc;
  try {
    doc = await task.promise;
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    throw new PdfReadError(
      name === 'PasswordException'
        ? 'O PDF está protegido por senha. Salve uma cópia sem senha e tente de novo.'
        : 'Não consegui abrir este PDF. Ele pode estar corrompido.',
    );
  }

  const lines: ResumeImportLine[] = [];
  try {
    for (let number = 1; number <= Math.min(doc.numPages, MAX_PAGES); number++) {
      const page = await doc.getPage(number);
      const content = await page.getTextContent();
      // Os nomes das fontes ("Calibri-Bold") só ficam disponíveis depois disto.
      await page.getOperatorList();
      const fontName = (id: string): string | undefined => {
        try {
          return (page.commonObjs.get(id) as { name?: string } | undefined)?.name;
        } catch {
          return undefined;
        }
      };
      const items: PdfTextItem[] = [];
      for (const item of content.items) {
        if (!('str' in item) || !item.str) continue;
        const [a, b, c, d, x, y] = item.transform as number[];
        items.push({
          text: item.str,
          x: x!,
          y: y!,
          width: item.width,
          size: Math.hypot(c!, d!) || Math.hypot(a!, b!),
          bold: isBoldFont(fontName(item.fontName)),
        });
      }
      lines.push(...pdfItemsToLines(items, page.view[2] ?? 595, number));
    }
  } finally {
    void task.destroy();
  }

  if (lines.length === 0) {
    throw new PdfReadError(
      'Este PDF não tem texto — parece uma imagem escaneada. Exporte o currículo direto do editor (Word, Google Docs, Canva) e tente de novo.',
    );
  }
  return lines;
}
