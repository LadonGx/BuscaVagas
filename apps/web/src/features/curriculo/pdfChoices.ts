import type { FieldItem, ResumeSectionDto } from '@busca-vagas/shared';
import { useState } from 'react';
import { normalizeItem } from './draft';

/**
 * O que entra no PDF. Por padrão, tudo — menos o que não costuma ir num
 * currículo: a seção "Respostas prontas" (pretensão, disponibilidade) e os
 * campos de data de nascimento e pretensão salarial, em qualquer seção.
 * A escolha da pessoa fica salva no navegador, por id.
 */
export const PDF_CHOICES_KEY = 'busca-vagas:curriculo-pdf';

const HIDDEN_SECTIONS = ['respostas prontas'];
const HIDDEN_FIELDS = ['data de nascimento', 'pretensao salarial'];

/** Sem acento e em minúsculas, para comparar rótulos. */
export function plain(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
}

export const sectionShownByDefault = (title: string) =>
  !HIDDEN_SECTIONS.some((hidden) => plain(title).includes(hidden));

export const fieldShownByDefault = (label: string) =>
  !HIDDEN_FIELDS.some((hidden) => plain(label).includes(hidden));

/** Escolhas da pessoa por id (seção ou campo). O que não está aqui segue o padrão. */
export type PdfChoices = Record<string, boolean>;

function readChoices(): PdfChoices {
  try {
    const raw = window.localStorage.getItem(PDF_CHOICES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as PdfChoices) : {};
  } catch {
    return {};
  }
}

export function usePdfChoices() {
  const [choices, setChoices] = useState<PdfChoices>(readChoices);

  function choose(id: string, shown: boolean) {
    setChoices((current) => {
      const next = { ...current, [id]: shown };
      try {
        window.localStorage.setItem(PDF_CHOICES_KEY, JSON.stringify(next));
      } catch {
        // Sem storage, a escolha vale só até fechar a página.
      }
      return next;
    });
  }

  return { choices, choose };
}

export function sectionShown(choices: PdfChoices, section: ResumeSectionDto): boolean {
  return choices[section.id] ?? sectionShownByDefault(section.title);
}

export function fieldShown(choices: PdfChoices, id: string, label: string): boolean {
  return choices[id] ?? fieldShownByDefault(label);
}

/** Campo que vira o nome no topo da página ("Nome completo", "Nome"). */
export function findName(
  sections: readonly ResumeSectionDto[],
): { id: string; value: string } | null {
  for (const section of sections) {
    if (section.kind !== 'fields') continue;
    for (const item of section.items) {
      const field = normalizeItem('fields', item.data) as FieldItem;
      if (plain(field.label).startsWith('nome') && field.value) {
        return { id: item.id, value: field.value };
      }
    }
  }
  return null;
}
