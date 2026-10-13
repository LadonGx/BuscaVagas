import { WORK_MODELS, type WorkModel } from '@busca-vagas/shared';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { JobFilters, JobTab } from '../../api/jobs';

/**
 * Os filtros da tela vivem na URL (em português): voltar funciona e um filtro
 * pode ir para os favoritos. Ex.: /vagas?aba=salvas&modelo=remote&nota=700
 * (`encerradas=mostrar` desliga o "Esconder encerradas", que vem ligado)
 */

const TAB_PARAM: Record<JobTab, string> = {
  inbox: 'caixa',
  saved: 'salvas',
  applied: 'candidatura',
  dismissed: 'descartadas',
};
const TAB_FROM_PARAM = Object.fromEntries(
  Object.entries(TAB_PARAM).map(([tab, param]) => [param, tab as JobTab]),
);

export const MIN_SCORE_OPTIONS = [500, 600, 700, 800] as const;

export function filtersFromParams(params: URLSearchParams): JobFilters {
  const workModel = (params.get('modelo') ?? '')
    .split(',')
    .filter((value): value is WorkModel => (WORK_MODELS as readonly string[]).includes(value));
  const minScore = Number(params.get('nota'));
  const sort = params.get('ordem');

  return {
    tab: TAB_FROM_PARAM[params.get('aba') ?? ''] ?? 'inbox',
    q: params.get('busca')?.trim() || undefined,
    workModel: workModel.length > 0 ? workModel : undefined,
    minScore: Number.isInteger(minScore) && minScore > 0 ? minScore : undefined,
    sort: sort === 'recentes' ? 'recent' : sort === 'nota' ? 'score' : undefined,
    hideIncompatible: params.get('incompativeis') === 'ocultar' || undefined,
    // Ligado por padrão; a URL só guarda a exceção (`encerradas=mostrar`).
    hideClosed: params.get('encerradas') !== 'mostrar',
  };
}

export function useJobFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(params), [params]);

  /** Muda um parâmetro; `undefined`/vazio remove. `replace` para digitação. */
  const setParam = useCallback(
    (name: string, value: string | undefined, options: { replace?: boolean } = {}) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value) next.set(name, value);
          else next.delete(name);
          return next;
        },
        { replace: options.replace },
      );
    },
    [setParams],
  );

  return useMemo(
    () => ({
      filters,
      /** Vaga aberta no painel (`?vaga=<id>`). */
      openJobId: params.get('vaga'),
      setTab: (tab: JobTab) => setParam('aba', tab === 'inbox' ? undefined : TAB_PARAM[tab]),
      setQuery: (q: string) => setParam('busca', q.trim() || undefined, { replace: true }),
      setWorkModels: (models: WorkModel[]) => setParam('modelo', models.join(',') || undefined),
      setMinScore: (value: number | undefined) =>
        setParam('nota', value ? String(value) : undefined),
      setSort: (sort: 'score' | 'recent' | undefined) =>
        setParam('ordem', sort === 'recent' ? 'recentes' : sort === 'score' ? 'nota' : undefined),
      setHideIncompatible: (hide: boolean) =>
        setParam('incompativeis', hide ? 'ocultar' : undefined),
      setHideClosed: (hide: boolean) => setParam('encerradas', hide ? undefined : 'mostrar'),
      openJob: (id: string) => setParam('vaga', id),
      closeJob: () => setParam('vaga', undefined),
    }),
    [filters, params, setParam],
  );
}
