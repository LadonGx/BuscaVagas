import { isRestrictedUrl } from '@busca-vagas/shared';
import type { Frame, Page } from 'playwright-core';
import { decide, type SkipReason } from './match.js';
import type { Profile } from './profile.js';
import { applyAnswers, collectFields, markFilled, showBanner, type Apply } from './scan.js';

export type FillEvent =
  | { kind: 'filled'; question: string; from: string }
  | { kind: 'skipped'; question: string; reason: SkipReason | 'no-pdf'; detail?: string };

const REASONS: Record<SkipReason | 'no-pdf', (detail?: string) => string> = {
  sensitive: () => 'dado pessoal sensível: preencha você',
  'no-answer': () => 'sem resposta salva',
  ambiguous: (detail) => `mais de uma resposta serve (${detail}): escolha você`,
  'no-option': (detail) => `"${detail}" não está entre as opções`,
  'too-long': (detail) => `a resposta é maior que o campo (${detail} caracteres)`,
  format: (detail) => (detail ? `formato diferente ("${detail}")` : 'tipo de arquivo diferente'),
  photo: () => 'campo de foto',
  'no-pdf': () => 'sem o PDF do currículo',
};

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

  constructor(
    private readonly profile: Profile,
    private readonly resumePdf: string | null,
    private readonly report: (event: FillEvent) => void,
  ) {}

  async fillPage(page: Page): Promise<void> {
    if (page.isClosed() || isRestrictedUrl(page.url())) return;
    const before = this.filled;
    for (const frame of page.frames()) {
      if (frame.isDetached() || !/^https?:/.test(frame.url()) || isRestrictedUrl(frame.url())) {
        continue;
      }
      try {
        await this.fillFrame(frame);
      } catch {
        // A página mudou no meio (navegação, quadro removido): na próxima volta.
      }
    }
    if (this.filled > 0 && this.filled !== before) {
      await page
        .mainFrame()
        .evaluate(showBanner, bannerText(this.filled))
        .catch(() => undefined);
    }
  }

  private async fillFrame(frame: Frame): Promise<void> {
    const fields = await frame.evaluate(collectFields);
    if (fields.length === 0) return;
    const onlyFile = fields.filter((field) => field.control === 'file').length === 1;
    const answers: Apply[] = [];
    const origin = new Map<string, { question: string; from: string }>();

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
          await frame.locator(`[data-bv-id="${field.id}"]`).setInputFiles(this.resumePdf);
          await frame.evaluate(markFilled, field.id);
          this.filled++;
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

    if (answers.length === 0) return;
    for (const id of await frame.evaluate(applyAnswers, answers)) {
      this.filled++;
      this.report({ kind: 'filled', ...origin.get(id)! });
    }
  }
}
