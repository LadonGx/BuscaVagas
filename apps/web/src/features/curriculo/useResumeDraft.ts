import type {
  ResumeDto,
  ResumeItemData,
  ResumeItemDto,
  ResumeSectionKind,
} from '@busca-vagas/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSaveItems, type ItemChange, type SaveResult } from '../../api/resume';
import { normalizeItem, sameItem, validateItem, type Drafts, type ItemErrors } from './draft';

export interface SaveOutcome {
  saved: number;
  /** Itens que não passaram na validação (não foram enviados). */
  invalid: number;
  failed: SaveResult['failed'];
}

/**
 * O que foi digitado e ainda não salvo. O rascunho guarda o item inteiro por
 * id; um item igual ao salvo (depois de aparar espaços) não conta como mudança.
 * Mudanças na estrutura (item novo, ordem) não mexem no rascunho.
 */
export function useResumeDraft(resume: ResumeDto | undefined) {
  const [drafts, setDrafts] = useState<Drafts>({});
  const [errors, setErrors] = useState<ItemErrors>({});
  const save = useSaveItems();

  const index = useMemo(() => {
    const map = new Map<string, { kind: ResumeSectionKind; item: ResumeItemDto }>();
    for (const section of resume?.sections ?? []) {
      for (const item of section.items) map.set(item.id, { kind: section.kind, item });
    }
    return map;
  }, [resume]);

  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  /** Só conta o que existe e está diferente do salvo. */
  const dirtyIds = useMemo(
    () =>
      Object.keys(drafts).filter((id) => {
        const found = index.get(id);
        return found !== undefined && !sameItem(found.kind, found.item.data, drafts[id]!);
      }),
    [drafts, index],
  );

  const edit = useCallback((id: string, data: ResumeItemData) => {
    const found = indexRef.current.get(id);
    if (!found) return;

    // Fica no rascunho mesmo igual ao salvo (ex.: espaço no fim enquanto se
    // digita); só não conta como alteração (`dirtyIds`).
    setDrafts((current) => ({ ...current, [id]: data }));

    // Depois de uma tentativa de salvar, o erro some assim que o item fica válido.
    setErrors((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      const itemErrors = validateItem(found.kind, data);
      if (Object.keys(itemErrors).length > 0) next[id] = itemErrors;
      else delete next[id];
      return next;
    });
  }, []);

  /** Esquece o rascunho de itens apagados (ou tudo, sem argumento). */
  const discard = useCallback((ids?: string[]) => {
    const drop = (current: Record<string, unknown>) => {
      if (!ids) return {};
      const next = { ...current };
      for (const id of ids) delete next[id];
      return next;
    };
    setDrafts((current) => drop(current) as Drafts);
    setErrors((current) => drop(current) as ItemErrors);
  }, []);

  async function saveAll(): Promise<SaveOutcome> {
    const nextErrors: ItemErrors = {};
    const changes: ItemChange[] = [];
    const sent: Drafts = {};

    for (const id of dirtyIds) {
      const { kind } = index.get(id)!;
      const data = drafts[id]!;
      const itemErrors = validateItem(kind, data);
      if (Object.keys(itemErrors).length > 0) {
        nextErrors[id] = itemErrors;
      } else {
        changes.push({ id, data: normalizeItem(kind, data) });
        sent[id] = data;
      }
    }

    setErrors(nextErrors);
    const result = changes.length > 0 ? await save.mutateAsync(changes) : { saved: [], failed: [] };

    // Some o que foi salvo e o que já era igual ao salvo. Se a pessoa digitou
    // de novo enquanto salvava, o rascunho novo fica.
    const saved = new Set(result.saved.map((item) => item.id));
    setDrafts((current) => {
      const next = { ...current };
      for (const id of Object.keys(next)) {
        const unchanged = !dirtyIds.includes(id) && next[id] === drafts[id];
        if ((saved.has(id) && next[id] === sent[id]) || unchanged) delete next[id];
      }
      return next;
    });

    return {
      saved: result.saved.length,
      invalid: Object.keys(nextErrors).length,
      failed: result.failed,
    };
  }

  return {
    drafts,
    errors,
    dirtyCount: dirtyIds.length,
    isDirty: (id: string) => dirtyIds.includes(id),
    edit,
    discard,
    saveAll,
    saving: save.isPending,
  };
}

export type ResumeDraft = ReturnType<typeof useResumeDraft>;
