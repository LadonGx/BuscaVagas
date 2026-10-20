import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withHeadless } from './browser.js';

export interface ResumePdf {
  path: string;
  /** "Curriculo - Ana Souza.pdf" */
  name: string;
  content: Buffer;
}

/**
 * Nome de arquivo seguro ("Curriculo - Joao Souza.pdf"): sem acento, porque
 * o campo de upload de alguns navegadores recusa caminho com acento.
 */
export function pdfName(person: string | null): string {
  const clean = (person ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return clean ? `Curriculo - ${clean}.pdf` : 'Curriculo.pdf';
}

/**
 * O PDF da tela "Currículo → Salvar como PDF" (`/curriculo/imprimir`), com
 * as seções que ela mostra por padrão (sem "Respostas prontas", data de
 * nascimento e pretensão). Gerado numa pasta temporária, nunca no projeto.
 * Currículo vazio → `null`.
 */
export async function makeResumePdf(webOrigin: string, dir: string): Promise<ResumePdf | null> {
  return withHeadless(async (context) => {
    const page = await context.newPage();
    await page.goto(`${webOrigin}/curriculo/imprimir`, { waitUntil: 'load', timeout: 20_000 });
    const paper = page.locator('article[aria-label="Prévia do currículo"]');
    await paper.waitFor({ timeout: 20_000 });
    // A tela ajusta a letra para caber em 1 página e marca quando terminou.
    await page.locator('article[data-pronto]').waitFor({ timeout: 20_000 });
    await page.evaluate(() => document.fonts.ready);
    if ((await paper.getByText('Nada para mostrar').count()) > 0) return null;
    const person = (await paper.locator('h1').first().textContent())?.trim() ?? null;
    // Como o "Salvar como PDF" do navegador: sem as cores de fundo da tela.
    const content = await page.pdf({ format: 'A4', preferCSSPageSize: true });
    const name = pdfName(person === 'Currículo' ? null : person);
    const path = join(dir, name);
    await writeFile(path, content);
    return { path, name, content };
  });
}
