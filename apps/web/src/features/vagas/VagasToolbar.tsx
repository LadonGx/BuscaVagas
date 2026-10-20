import {
  WORK_MODEL_LABELS,
  WORK_MODELS,
  type JobCountsDto,
  type WorkModel,
} from '@busca-vagas/shared';
import { Search } from 'lucide-react';
import type { SourceOption } from '../../api/discovery';
import type { JobFilters, JobTab } from '../../api/jobs';
import { formatNumber } from '../../lib/format';
import { useSearchText } from '../../lib/useSearchText';
import { MIN_SCORE_OPTIONS } from './useJobFilters';
import styles from './VagasToolbar.module.css';

/** Abas onde "Esconder encerradas" faz diferença (salvas e com candidatura nunca somem). */
const CLOSED_HIDES_IN: readonly JobTab[] = ['inbox', 'dismissed'];

/** Vagas da caixa visíveis com os filtros: sem as encerradas, quando escondidas. */
export function inboxCount(counts: JobCountsDto, hideClosed: boolean | undefined): number {
  return counts.triage.inbox - (hideClosed ? counts.inboxClosed : 0);
}

const TABS: {
  tab: JobTab;
  label: string;
  count: (c: JobCountsDto, f: JobFilters) => number;
}[] = [
  { tab: 'inbox', label: 'Caixa', count: (c, f) => inboxCount(c, f.hideClosed) },
  { tab: 'saved', label: 'Salvas', count: (c) => c.triage.saved },
  { tab: 'applied', label: 'Com candidatura', count: (c) => c.withApplication },
  { tab: 'dismissed', label: 'Descartadas', count: (c) => c.triage.dismissed },
];

/** Espera de digitação antes de buscar. */
export const SEARCH_DEBOUNCE_MS = 300;

interface VagasToolbarProps {
  filters: JobFilters;
  counts?: JobCountsDto;
  onTab: (tab: JobTab) => void;
  onQuery: (q: string) => void;
  onWorkModels: (models: WorkModel[]) => void;
  onMinScore: (value: number | undefined) => void;
  onSort: (sort: 'score' | 'recent' | undefined) => void;
  onHideIncompatible: (hide: boolean) => void;
  onHideClosed: (hide: boolean) => void;
  /** Opções do filtro de fonte (useSourceOptions). */
  sourceOptions: SourceOption[];
  onSource: (source: string | undefined) => void;
}

export function VagasToolbar(props: VagasToolbarProps) {
  const { filters, counts } = props;
  // Busca depois que a pessoa para de digitar; Voltar ou um link trazem o texto da URL.
  const search = useSearchText(filters.q ?? '', props.onQuery, SEARCH_DEBOUNCE_MS);

  const models = filters.workModel ?? [];
  const toggleModel = (model: WorkModel) =>
    props.onWorkModels(
      models.includes(model) ? models.filter((m) => m !== model) : [...models, model],
    );

  return (
    <div className={styles.toolbar}>
      <div className={styles.row}>
        <label className={styles.search}>
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Buscar vagas</span>
          <input
            type="search"
            value={search.text}
            onChange={(event) => search.onChange(event.target.value)}
            placeholder="Buscar por título ou empresa…"
          />
        </label>

        <fieldset className={styles.group}>
          <legend className="sr-only">Modalidade</legend>
          {WORK_MODELS.map((model) => (
            <button
              key={model}
              type="button"
              className={styles.toggle}
              aria-pressed={models.includes(model)}
              onClick={() => toggleModel(model)}
            >
              {WORK_MODEL_LABELS[model]}
            </button>
          ))}
        </fieldset>

        <label className={styles.select}>
          <span className="sr-only">Nota mínima</span>
          <select
            value={filters.minScore ?? ''}
            onChange={(event) =>
              props.onMinScore(event.target.value ? Number(event.target.value) : undefined)
            }
          >
            <option value="">Qualquer nota</option>
            {MIN_SCORE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                Nota ≥ {value}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.select}>
          <span className="sr-only">Fonte</span>
          <select
            value={filters.source ?? ''}
            onChange={(event) => props.onSource(event.target.value || undefined)}
          >
            <option value="">Qualquer fonte</option>
            {props.sourceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
            {filters.source &&
              !props.sourceOptions.some((option) => option.value === filters.source) && (
                <option value={filters.source}>{filters.source}</option>
              )}
          </select>
        </label>

        <label className={styles.select}>
          <span className="sr-only">Ordem</span>
          <select
            value={filters.sort ?? ''}
            onChange={(event) =>
              props.onSort((event.target.value || undefined) as 'score' | 'recent' | undefined)
            }
          >
            <option value="">Ordem automática</option>
            <option value="score">Melhor nota</option>
            <option value="recent">Entrada mais recente</option>
          </select>
        </label>

        <label className={styles.check}>
          <input
            type="checkbox"
            checked={Boolean(filters.hideIncompatible)}
            onChange={(event) => props.onHideIncompatible(event.target.checked)}
          />
          Esconder incompatíveis
        </label>

        {CLOSED_HIDES_IN.includes(filters.tab) && (
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={Boolean(filters.hideClosed)}
              onChange={(event) => props.onHideClosed(event.target.checked)}
            />
            Esconder encerradas
          </label>
        )}
      </div>

      <div className={styles.tabs} role="group" aria-label="Situação">
        {TABS.map(({ tab, label, count }) => (
          <button
            key={tab}
            type="button"
            className={styles.tab}
            data-tab={tab}
            aria-pressed={filters.tab === tab}
            onClick={() => props.onTab(tab)}
          >
            <span className={styles.dot} aria-hidden="true" />
            {label}
            {counts && <span className={styles.count}>{formatNumber(count(counts, filters))}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
