import { isRestrictedUrl, RESTRICTED_SITES } from '@busca-vagas/shared';
import type { Frame, Page } from 'playwright-core';
import { decide, type SkipReason } from './match.js';
import type { Profile } from './profile.js';
import {
  applyAnswers,
  collectFields,
  countFileInputs,
  markFilled,
  showBanner,
  type Apply,
} from './scan.js';

export type FillEvent =
  | { kind: 'filled'; question: string; from: string }
  | {
      kind: 'skipped';
      question: string;
      reason: SkipReason | 'no-pdf' | 'resume-done';
      detail?: string;
    };

const REASONS: Record<SkipReason | 'no-pdf' | 'resume-done', (detail?: string) => string> = {
  sensitive: () => 'dado pessoal sensível: preencha você',
  'no-answer': () => 'sem resposta salva',
  ambiguous: (detail) => `mais de uma resposta serve (${detail}): escolha você`,
  'no-option': (detail) => `"${detail}" não está entre as opções`,
  'too-long': (detail) => `a resposta é maior que o campo (${detail} caracteres)`,
  format: (detail) => (detail ? `formato diferente ("${detail}")` : 'tipo de arquivo diferente'),
  photo: () => 'campo de foto',
  'no-pdf': () => 'sem o PDF do currículo',
  'resume-done': () => 'o currículo já foi anexado em outro campo desta aba',
};

/** Os sites restritos, para as funções que rodam na página conferirem lá dentro. */
const RESTRICTED = [...RESTRICTED_SITES];

/** "Por que você quer...?" — sem resposta salva */
export function describeEvent(event: FillEvent): string {
  return event.kind === 'filled'
    ? `  ✓ ${event.question} ← ${event.from}`
    : `  · ${event.question}: ${REASONS[event.reason](event.detail)}`;
}

export function bannerText(filled: number): string {
  return (
    `BuscaVagas preencheu ${filled} ${filled === 1 ? 'campo' : 'campos'} (contorno roxo). ` +
    'Confira tudo e envie você: nada é enviado sozinho.'
  );
}

/**
 * Preenche os campos novos de cada página e quadro (iframe). Só escreve em
 * campo vazio, nunca clica em botão, nunca envia; nos sites restritos não
 * faz nada.
 */
export class Filler {
  filled = 0;
  resumeAttached = false;
  /** Abas em que o currículo já foi anexado: uma vez por aba, num campo só. */
  private readonly resumePages = new WeakSet<Page>();
  /** Abas com alerta do site aberto (alert, confirm, prompt): esperam você responder. */
  private readonly dialogs = new WeakSet<Page>();
  /** Abas no meio de uma volta: a próxima espera esta terminar. */
  private readonly running = new WeakSet<Page>();

  constructor(
    private readonly profile: Profile,
    private readonly resumePdf: string | null,
    private readonly report: (event: FillEvent) => void,
  ) {}

  /**
   * Sem quem escute, o Playwright fecha sozinho os alertas do site (o
   * `confirm()` voltaria "Cancelar" na hora). Com este ouvinte, que não faz
   * nada, o alerta fica na tela para você responder; enquanto isso, a aba
   * fica sem preencher.
   */
  watch(page: Page): void {
    page.on('dialog', () => {
      this.dialogs.add(page);
    });
    page.on('dialogclosed', () => {
      this.dialogs.delete(page);
    });
  }

  async fillPage(page: Page): Promise<void> {
    if (page.isClosed() || this.dialogs.has(page) || this.running.has(page)) return;
    if (isRestrictedUrl(page.url())) return;
    this.running.add(page);
    try {
      const frames = page
        .frames()
        .filter(
          (frame) =>
            !frame.isDetached() && /^https?:/.test(frame.url()) && !isRestrictedUrl(frame.url()),
        );

      // Campos de arquivo da página inteira: o currículo sem rótulo só vai
      // para o único. Na dúvida (um quadro não respondeu), nenhum é o único.
      let files = 0;
      for (const frame of frames) {
        files += await frame.evaluate(countFileInputs, RESTRICTED).catch(() => Infinity);
      }

      let filledHere = 0;
      for (const frame of frames) {
        try {
          filledHere += await this.fillFrame(page, frame, files === 1);
        } catch {
          // A página mudou no meio (navegação, quadro removido): na próxima volta.
        }
      }
      if (filledHere > 0) {
        await page
          .mainFrame()
          .evaluate(showBanner, { message: bannerText(this.filled), restricted: RESTRICTED })
          .catch(() => undefined);
      }
    } finally {
      this.running.delete(page);
    }
  }

  /** Preenche um quadro; devolve quantos campos preencheu. */
  private async fillFrame(page: Page, frame: Frame, onlyFile: boolean): Promise<number> {
    const fields = await frame.evaluate(collectFields, RESTRICTED);
    if (fields.length === 0) return 0;
    const answers: Apply[] = [];
    const origin = new Map<string, { question: string; from: string }>();
    let filled = 0;

    for (const field of fields) {
      const question = field.label || field.placeholder || field.name || '(campo sem nome)';
      const decision = decide(field, this.profile, onlyFile);
      switch (decision.kind) {
        case 'value':
          answers.push({ id: field.id, value: decision.value });
          origin.set(field.id, { question, from: decision.from });
          break;
        case 'option':
          answers.push({ id: field.id, index: decision.index });
          origin.set(field.id, { question, from: decision.from });
          break;
        case 'resume-file':
          if (!this.resumePdf) {
            this.report({ kind: 'skipped', question, reason: 'no-pdf' });
            break;
          }
          if (this.resumePages.has(page)) {
            this.report({ kind: 'skipped', question, reason: 'resume-done' });
            break;
          }
          this.resumePages.add(page);
          try {
            await frame
              .locator(`[data-bv-id="${field.id}"]`)
              .setInputFiles(this.resumePdf, { timeout: 5_000 });
          } catch (error) {
            this.resumePages.delete(page);
            throw error;
          }
          await frame.evaluate(markFilled, field.id);
          this.filled++;
          filled++;
          this.resumeAttached = true;
          this.report({ kind: 'filled', question, from: 'Currículo (PDF)' });
          break;
        case 'skip':
          // Campo sem rótulo e sem resposta: nem vale avisar.
          if (decision.reason !== 'no-answer' || field.label) {
            this.report({
              kind: 'skipped',
              question,
              reason: decision.reason,
              detail: decision.detail,
            });
          }
      }
    }

    if (answers.length === 0) return filled;
    for (const id of await frame.evaluate(applyAnswers, { answers, restricted: RESTRICTED })) {
      this.filled++;
      filled++;
      this.report({ kind: 'filled', ...origin.get(id)! });
    }
    return filled;
  }
}
