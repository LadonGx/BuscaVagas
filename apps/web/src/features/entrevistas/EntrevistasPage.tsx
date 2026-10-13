import {
  INTERVIEW_CATEGORIES,
  INTERVIEW_CATEGORY_LABELS,
  type InterviewQuestionDto,
} from '@busca-vagas/shared';
import { Dumbbell, MessagesSquare, Plus, Search, SearchX, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useInterviewQuestions } from '../../api/interviews';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { formatNumber } from '../../lib/format';
import {
  categoryParam,
  countByCategory,
  filterQuestions,
  needsPractice,
  useQuestionFilters,
  type QuestionStatus,
} from './filters';
import { QuestionEditor } from './QuestionEditor';
import styles from './Entrevistas.module.css';

const plural = (count: number, one: string, many: string) =>
  `${formatNumber(count)} ${count === 1 ? one : many}`;

/** Espera de digitação antes de filtrar. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * Banco de perguntas de entrevista com as suas respostas
 * (docs/features/15-interview-questions.md).
 */
export function EntrevistasPage() {
  const { data, isPending, isError, error, refetch } = useInterviewQuestions();
  const controls = useQuestionFilters();
  const { filters, openId } = controls;
  const all = data ?? [];
  const shown = filterQuestions(all, filters);
  const counts = countByCategory(all);
  const answered = all.filter((question) => question.answered).length;
  const practice = all.filter(needsPractice).length;
  const editing = openId === 'nova' ? null : all.find((question) => question.id === openId);
  const filtered = Boolean(filters.q || filters.category || filters.status || filters.tag);

  const practiceParams = new URLSearchParams();
  if (filters.category) practiceParams.set('categoria', categoryParam(filters.category));
  if (filters.tag) practiceParams.set('tag', filters.tag);
  const practiceHref = `/entrevistas/treino${practiceParams.size ? `?${practiceParams}` : ''}`;

  return (
    <>
      <PageHeader
        title="Entrevistas"
        subtitle={
          data
            ? `${plural(all.length, 'pergunta', 'perguntas')} · ${plural(answered, 'respondida', 'respondidas')} · ${formatNumber(practice)} para treinar`
            : 'Suas respostas para as perguntas que mais caem'
        }
        actions={
          <>
            <Button
              icon={<Plus size={16} aria-hidden="true" />}
              onClick={() => controls.open('nova')}
            >
              Nova pergunta
            </Button>
            <Link className={styles.primaryLink} to={practiceHref}>
              <Dumbbell size={16} aria-hidden="true" />
              Treinar
            </Link>
          </>
        }
      />

      <Toolbar controls={controls} counts={counts} total={all.length} />

      {isPending ? (
        <p className={styles.muted}>Carregando perguntas…</p>
      ) : isError ? (
        <EmptyState title="Não consegui carregar as perguntas">
          <p>{error.message}</p>
          <Button onClick={() => void refetch()}>Tentar de novo</Button>
        </EmptyState>
      ) : shown.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={<SearchX size={22} aria-hidden="true" />}
            title="Nada com esses filtros"
          >
            Tente outra busca ou tire um filtro.
          </EmptyState>
        ) : (
          <EmptyState
            icon={<MessagesSquare size={22} aria-hidden="true" />}
            title="Nenhuma pergunta"
          >
            Clique em "Nova pergunta" para começar o seu banco.
          </EmptyState>
        )
      ) : (
        <ul className={styles.list} aria-label="Perguntas">
          {shown.map((question) => (
            <QuestionCard
              key={question.id}
              question={question}
              onOpen={() => controls.open(question.id)}
              onTag={(tag) => controls.setTag(tag)}
            />
          ))}
        </ul>
      )}

      {data && (openId === 'nova' || editing) && (
        <QuestionEditor
          key={openId}
          question={editing ?? null}
          onClose={controls.close}
          onCreated={(id) => controls.open(id)}
        />
      )}
    </>
  );
}

function Toolbar({
  controls,
  counts,
  total,
}: {
  controls: ReturnType<typeof useQuestionFilters>;
  counts: ReturnType<typeof countByCategory>;
  total: number;
}) {
  const { filters } = controls;
  const [text, setText] = useState(filters.q ?? '');
  const { setQuery } = controls;

  useEffect(() => {
    const timer = setTimeout(() => {
      if (text.trim() !== (filters.q ?? '')) setQuery(text);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, filters.q, setQuery]);

  return (
    <div className={styles.toolbar}>
      <div className={styles.row}>
        <label className={styles.search}>
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Buscar nas perguntas e respostas</span>
          <input
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Buscar nas perguntas e respostas…"
          />
        </label>
        <label className={styles.select}>
          <span className="sr-only">Situação</span>
          <select
            value={filters.status ?? ''}
            onChange={(event) =>
              controls.setStatus((event.target.value || undefined) as QuestionStatus | undefined)
            }
          >
            <option value="">Todas as situações</option>
            <option value="unanswered">Sem resposta</option>
            <option value="answered">Respondidas</option>
            <option value="practice">Para treinar</option>
          </select>
        </label>
        {filters.tag && (
          <button
            type="button"
            className={styles.activeTag}
            onClick={() => controls.setTag(undefined)}
            aria-label={`Tirar o filtro da tag ${filters.tag}`}
          >
            #{filters.tag}
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className={styles.tabs} role="group" aria-label="Categoria">
        <button
          type="button"
          className={styles.tab}
          aria-pressed={!filters.category}
          onClick={() => controls.setCategory(undefined)}
        >
          Todas <span className={styles.count}>{formatNumber(total)}</span>
        </button>
        {INTERVIEW_CATEGORIES.map((category) => (
          <button
            key={category}
            type="button"
            className={styles.tab}
            aria-pressed={filters.category === category}
            onClick={() => controls.setCategory(category)}
          >
            {INTERVIEW_CATEGORY_LABELS[category]}{' '}
            <span className={styles.count}>{formatNumber(counts[category])}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function QuestionCard({
  question,
  onOpen,
  onTag,
}: {
  question: InterviewQuestionDto;
  onOpen: () => void;
  onTag: (tag: string) => void;
}) {
  const preview = question.answer ?? question.starSituation ?? question.starAction ?? null;
  const asked = question.asked.length;
  return (
    <li className={styles.card}>
      <button type="button" className={styles.cardMain} onClick={onOpen}>
        <span className={styles.cardQuestion}>{question.question}</span>
        {preview ? (
          <span className={styles.preview}>{preview}</span>
        ) : (
          <span className={styles.muted}>Sem resposta ainda — clique para escrever.</span>
        )}
      </button>
      <div className={styles.cardMeta}>
        <span className={styles.chip} data-category={question.category}>
          {INTERVIEW_CATEGORY_LABELS[question.category]}
        </span>
        {needsPractice(question) && (
          <span className={styles.flag} data-tone="warn">
            Para treinar
          </span>
        )}
        {asked > 0 && (
          <span className={styles.flag} data-tone="info">
            Caiu em {asked === 1 ? '1 processo' : `${asked} processos`}
          </span>
        )}
        {question.tags.map((tag) => (
          <button key={tag} type="button" className={styles.tag} onClick={() => onTag(tag)}>
            #{tag}
          </button>
        ))}
      </div>
    </li>
  );
}
