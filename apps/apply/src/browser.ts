import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium, type BrowserContext, type LaunchOptions } from 'playwright-core';

/**
 * O navegador do preenchimento: o Chrome (ou o Edge) que já está instalado,
 * com um perfil só do BuscaVagas. Os logins que você fizer nele (Gupy...)
 * ficam guardados nesse perfil, fora do projeto; nenhuma senha passa pelo app.
 */
export const PROFILE_DIR =
  process.env.BUSCAVAGAS_PERFIL || join(homedir(), '.buscavagas', 'navegador');

/** `BUSCAVAGAS_NAVEGADOR`: chrome, msedge, chromium ou o caminho do executável. */
function choices(): LaunchOptions[] {
  const wanted = process.env.BUSCAVAGAS_NAVEGADOR?.trim();
  if (wanted && /[\\/]/.test(wanted)) return [{ executablePath: wanted }];
  if (wanted) return [{ channel: wanted }];
  return [{ channel: 'chrome' }, { channel: 'msedge' }];
}

const headless = () => process.env.BUSCAVAGAS_HEADLESS === '1';

export class BrowserError extends Error {}

function explain(error: unknown): BrowserError | null {
  const message = error instanceof Error ? error.message : String(error);
  if (/ProcessSingleton|already in use|user data dir/i.test(message)) {
    return new BrowserError(
      'O navegador do BuscaVagas já está aberto. Feche a janela dele e rode o comando de novo.',
    );
  }
  return null;
}

/** Abre a janela (visível) com o perfil do BuscaVagas. */
export async function openBrowser(): Promise<BrowserContext> {
  let last: unknown;
  for (const option of choices()) {
    try {
      return await chromium.launchPersistentContext(PROFILE_DIR, {
        ...option,
        headless: headless(),
        viewport: null,
        args: ['--start-maximized'],
        // Ctrl+C no terminal: quem fecha a janela é o main.ts (e pergunta se você enviou).
        handleSIGINT: false,
      });
    } catch (error) {
      const known = explain(error);
      if (known) throw known;
      last = error;
    }
  }
  throw new BrowserError(
    'Não achei o Google Chrome nem o Microsoft Edge neste computador. Instale um deles ' +
      `(ou aponte BUSCAVAGAS_NAVEGADOR para outro). Detalhe: ${last instanceof Error ? last.message.split('\n')[0] : String(last)}`,
  );
}

/** Um navegador invisível, só para gerar o PDF do currículo. */
export async function withHeadless<T>(task: (context: BrowserContext) => Promise<T>): Promise<T> {
  let last: unknown;
  for (const option of choices()) {
    let browser;
    try {
      browser = await chromium.launch({ ...option, headless: true });
    } catch (error) {
      last = error;
      continue;
    }
    try {
      const context = await browser.newContext();
      return await task(context);
    } finally {
      await browser.close();
    }
  }
  throw new BrowserError(
    `Não consegui abrir o navegador para gerar o PDF: ${last instanceof Error ? last.message.split('\n')[0] : String(last)}`,
  );
}
