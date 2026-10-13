import {
  INTERVIEW_CATEGORIES,
  INTERVIEW_CATEGORY_LABELS,
  pickPracticeQuestion,
  STAR_FIELDS,
  type InterviewCategory,
  type InterviewQuestionDto,
  type PracticeRating,
} from '@busca-vagas/shared';
import { ArrowLeft, Dumbbell } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useInterviewQuestions, usePractice } from '../../api/interviews';
import { useToast } from '../../components/toast/toast-context';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { categoryParam, filtersFromParams, filterQuestions, needsPractice } from './filters';
import styles from './Entrevistas.module.css';

interface Session {
  seen: Set<string>;
  good: number;
  again: number;
}

const newSession = (): Session => ({ seen: new Set(), good: 0, again: 0 });

/** Atalhos: Espaço mostra a resposta; 1 = preciso treinar; 2 = fui bem. */
function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/**
 * Treino: uma pergunta por vez. Responda em voz alta, depois confira a sua
 * resposta e diga como foi — "preciso treinar" faz a pergunta voltar mais.
 * Plano: docs/features/15-interview-questions.md
 */
export function TreinoPage() {
  const { data, isPending, isError, error } = useInterviewQuestions();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const onlyPractice = filters.status === 'practice';
  const pool = useMemo(() => filterQuestions(data ?? [], filters), [data, filters]);
  const practice = usePractice();
  const toast = useToast();

  const [session, setSession] = useState(newSession);
  /** Pergunta "presa" na tela (a que você revelou ou está avaliando). */
  const [currentId, setCurrentId] = useState<string | null>(null);
  /** Sorteio da próxima: muda a cada avaliação/pulo, para a escolha ser estável entre renders. */
  const [seed, setSeed] = useState(() => Math.random());
  const [revealed, setRevealed] = useState(false);

  // A atual, se ainda está no filtro; senão, a sorteada (sem efeito: é derivada).
  const current =
    pool.find((question) => question.id === currentId) ??
    pickPracticeQuestion(pool, session.seen, () => seed);

  const next = useCallback(() => {
    setRevealed(false);
    setCurrentId(null);
    setSeed(Math.random());
  }, []);

  const setParam = (name: string, value: string | undefined) => {
    setParams((old) => {
      const updated = new URLSearchParams(old);
      if (value) updated.set(name, value);
      else updated.delete(name);
      return updated;
    });
    setSession(newSession());
    next();
  };

  const rate = useCallback(
    (rating: PracticeRating) => {
      if (!current || practice.isPending) return;
      practice.mutate(
        { id: current.id, rating },
        {
          onSuccess: () => {
            const seen = new Set(session.seen).add(current.id);
            setSession({
              seen,
              good: session.good + (rating === 'good' ? 1 : 0),
              again: session.again + (rating === 'again' ? 1 : 0),
            });
            next();
          },
          onError: (failure) => toast.show({ tone: 'error', message: failure.message }),
        },
      );
    },
    [current, practice, session, next, toast],
  );

  const skip = () => {
    if (!current) return;
    const seen = new Set(session.seen).add(current.id);
    setSession({ ...session, seen });
    next();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === ' ' && !revealed && current) {
        event.preventDefault();
        setCurrentId(current.id);
        setRevealed(true);
      } else if (revealed && event.key === '1') rate('again');
      else if (revealed && event.key === '2') rate('good');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [revealed, current, rate]);

  const done = session.good + session.again;

  return (
    <>
      <PageHeader
        title="Treino"
        subtitle={
          done > 0
            ? `Nesta sessão: ${done} · ${session.good} fui bem · ${session.again} para treinar`
            : 'Responda em voz alta, depois confira a sua resposta'
        }
        actions={
          <Link className={styles.backLink} to="/entrevistas">
            <ArrowLeft size={16} aria-hidden="true" />
            Voltar às perguntas
          </Link>
        }
      />

      <div className={styles.toolbar}>
        <div className={styles.row}>
          <label className={styles.select}>
            <span className="sr-only">Categoria</span>
            <select
              value={filters.category ?? ''}
              onChange={(event) =>
                setParam(
                  'categoria',
                  event.target.value
                    ? categoryParam(event.target.value as InterviewCategory)
                    : undefined,
                )
              }
            >
              <option value="">Todas as categorias</option>
              {INTERVIEW_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {INTERVIEW_CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={onlyPractice}
              onChange={(event) =>
                setParam('situacao', event.target.checked ? 'treinar' : undefined)
              }
            />
            Só as que preciso treinar
          </label>
          {filters.tag && (
            <button
              type="button"
              className={styles.activeTag}
              onClick={() => setParam('tag', undefined)}
            >
              #{filters.tag} ×
            </button>
          )}
          <span className={styles.muted}>
            {pool.length === 1 ? '1 pergunta' : `${pool.length} perguntas`} no treino
          </span>
        </div>
      </div>

      {isPending ? (
        <p className={styles.muted}>Carregando…</p>
      ) : isError ? (
        <EmptyState title="Não consegui carregar as perguntas">{error.message}</EmptyState>
      ) : !current ? (
        <EmptyState icon={<Dumbbell size={22} aria-hidden="true" />} title="Nada para treinar aqui">
          {onlyPractice
            ? 'Nenhuma pergunta marcada como "preciso treinar" com esses filtros.'
            : 'Nenhuma pergunta com esses filtros.'}
        </EmptyState>
      ) : (
        <PracticeCard
          question={current}
          revealed={revealed}
          busy={practice.isPending}
          onReveal={() => {
            setCurrentId(current.id);
            setRevealed(true);
          }}
          onRate={rate}
          onSkip={skip}
        />
      )}
    </>
  );
}

function PracticeCard({
  question,
  revealed,
  busy,
  onReveal,
  onRate,
  onSkip,
}: {
  question: InterviewQuestionDto;
  revealed: boolean;
  busy: boolean;
  onReveal: () => void;
  onRate: (rating: PracticeRating) => void;
  onSkip: () => void;
}) {
  const star = STAR_FIELDS.filter(([key]) => question[key]?.trim());
  return (
    <article className={styles.practice} aria-label="Pergunta do treino">
      <div className={styles.cardMeta}>
        <span className={styles.chip} data-category={question.category}>
          {INTERVIEW_CATEGORY_LABELS[question.category]}
        </span>
        {needsPractice(question) && (
          <span className={styles.flag} data-tone="warn">
            Para treinar
          </span>
        )}
        {question.tags.map((tag) => (
          <span key={tag} className={styles.tagStatic}>
            #{tag}
          </span>
        ))}
      </div>

      <h2 className={styles.practiceQuestion}>{question.question}</h2>

      {!revealed ? (
        <div className={styles.buttons}>
          <Button variant="primary" onClick={onReveal}>
            Mostrar minha resposta
          </Button>
          <Button variant="ghost" onClick={onSkip}>
            Pular
          </Button>
          <span className={styles.muted}>Espaço mostra a resposta</span>
        </div>
      ) : (
        <>
          <section className={styles.reveal} aria-label="Sua resposta">
            {question.answered ? (
              <>
                {question.answer && <p className={styles.answerText}>{question.answer}</p>}
                {star.length > 0 && (
                  <dl className={styles.starList}>
                    {star.map(([key, label]) => (
                      <div key={key}>
                        <dt>{label}</dt>
                        <dd>{question[key]}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </>
            ) : (
              <p className={styles.muted}>
                Você ainda não escreveu uma resposta.{' '}
                <Link to={`/entrevistas?pergunta=${question.id}`}>Escrever agora</Link>
              </p>
            )}
          </section>
          <div className={styles.buttons}>
            <Button disabled={busy} onClick={() => onRate('again')}>
              Preciso treinar
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => onRate('good')}>
              Fui bem
            </Button>
            <span className={styles.muted}>Teclas 1 e 2</span>
          </div>
        </>
      )}
    </article>
  );
}
