import {
  foldText,
  INTERVIEW_CATEGORIES,
  INTERVIEW_CATEGORY_LABELS,
  type InterviewCategory,
  type InterviewQuestionDto,
} from '@busca-vagas/shared';
import { X } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  useCreateQuestion,
  useInterviewQuestions,
  useMarkAsked,
  useUnmarkAsked,
} from '../../api/interviews';
import { useToast } from '../../components/toast/toast-context';
import { Button } from '../../components/ui/Button';
import styles from './ApplicationDrawer.module.css';

const MAX_SUGGESTIONS = 5;

/** Perguntas do banco que batem com o que você digitou (todas as palavras). */
export function suggestQuestions(
  list: readonly InterviewQuestionDto[],
  text: string,
  exclude: ReadonlySet<string>,
): InterviewQuestionDto[] {
  const words = foldText(text).split(' ').filter(Boolean);
  if (words.length === 0) return [];
  return list
    .filter((question) => !exclude.has(question.id))
    .filter((question) => {
      const folded = foldText(`${question.question} ${question.tags.join(' ')}`);
      return words.every((word) => folded.includes(word));
    })
    .slice(0, MAX_SUGGESTIONS);
}

/**
 * "Perguntas da entrevista" no painel da candidatura: o que perguntaram e
 * como foi. Liga ao banco da tela Entrevistas (docs/features/15-interview-questions.md).
 */
export function ApplicationQuestions({ applicationId }: { applicationId: string }) {
  const { data, isError, error } = useInterviewQuestions();
  const asked = (data ?? []).filter((question) =>
    question.asked.some((item) => item.applicationId === applicationId),
  );
  const headingId = useId();

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <h3 className={styles.label} id={headingId}>
        Perguntas da entrevista
      </h3>
      {isError && <p className={styles.muted}>{error.message}</p>}
      {asked.length > 0 ? (
        <ul className={styles.askedList}>
          {asked.map((question) => (
            <AskedItem key={question.id} question={question} applicationId={applicationId} />
          ))}
        </ul>
      ) : (
        data && (
          <p className={styles.muted}>
            Anote o que perguntaram: a pergunta vai para o seu banco e dá para treinar depois.
          </p>
        )
      )}
      {data && <AddQuestion questions={data} asked={asked} applicationId={applicationId} />}
    </section>
  );
}

function AskedItem({
  question,
  applicationId,
}: {
  question: InterviewQuestionDto;
  applicationId: string;
}) {
  const note = question.asked.find((item) => item.applicationId === applicationId)?.note ?? '';
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note);
  const mark = useMarkAsked();
  const unmark = useUnmarkAsked();
  const toast = useToast();
  const onError = (failure: Error) => toast.show({ tone: 'error', message: failure.message });

  return (
    <li className={styles.askedItem}>
      <div className={styles.askedHead}>
        <Link to={`/entrevistas?pergunta=${question.id}`} className={styles.askedQuestion}>
          {question.question}
        </Link>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={`Tirar "${question.question}" desta candidatura`}
          disabled={unmark.isPending}
          onClick={() => unmark.mutate({ id: question.id, applicationId }, { onError })}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
      {editing ? (
        <form
          className={styles.noteForm}
          onSubmit={(event) => {
            event.preventDefault();
            mark.mutate(
              { id: question.id, applicationId, note: text },
              { onSuccess: () => setEditing(false), onError },
            );
          }}
        >
          <input
            value={text}
            maxLength={2_000}
            onChange={(event) => setText(event.target.value)}
            placeholder="Como foi? Ex.: travei no exemplo, gostaram da resposta"
            aria-label="Como foi"
            autoFocus
          />
          <Button type="submit" disabled={mark.isPending}>
            Salvar
          </Button>
          <Button variant="ghost" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        </form>
      ) : (
        <div className={styles.askedNote}>
          {note ? <span>{note}</span> : null}
          <button
            type="button"
            className={styles.textButton}
            onClick={() => {
              setText(note);
              setEditing(true);
            }}
          >
            {note ? 'Editar anotação' : 'Anotar como foi'}
          </button>
          {!question.answered && <span className={styles.muted}>· sem resposta no banco</span>}
        </div>
      )}
    </li>
  );
}

function AddQuestion({
  questions,
  asked,
  applicationId,
}: {
  questions: readonly InterviewQuestionDto[];
  asked: readonly InterviewQuestionDto[];
  applicationId: string;
}) {
  const [text, setText] = useState('');
  const [category, setCategory] = useState<InterviewCategory>('technical');
  const mark = useMarkAsked();
  const create = useCreateQuestion();
  const toast = useToast();
  const inputId = useId();
  const onError = (failure: Error) => toast.show({ tone: 'error', message: failure.message });

  const suggestions = suggestQuestions(questions, text, new Set(asked.map((item) => item.id)));
  const exact = questions.some((question) => foldText(question.question) === foldText(text));
  const canCreate = text.trim().length >= 3 && !exact;

  function createNew(event: FormEvent) {
    event.preventDefault();
    if (!canCreate) return;
    create.mutate(
      { question: text, category, askedIn: applicationId },
      {
        onSuccess: () => {
          setText('');
          toast.show({
            tone: 'success',
            message: 'Pergunta adicionada ao banco. Escreva a resposta em Entrevistas.',
          });
        },
        onError,
      },
    );
  }

  return (
    <form className={styles.addQuestion} onSubmit={createNew}>
      <label htmlFor={inputId} className={styles.muted}>
        Qual pergunta fizeram?
      </label>
      <input
        id={inputId}
        value={text}
        maxLength={500}
        onChange={(event) => setText(event.target.value)}
        placeholder="Busque no banco ou escreva uma nova"
        autoComplete="off"
      />
      {suggestions.length > 0 && (
        <ul className={styles.suggestions} aria-label="Perguntas do banco">
          {suggestions.map((question) => (
            <li key={question.id}>
              <button
                type="button"
                disabled={mark.isPending}
                onClick={() =>
                  mark.mutate(
                    { id: question.id, applicationId },
                    { onSuccess: () => setText(''), onError },
                  )
                }
              >
                {question.question}
              </button>
            </li>
          ))}
        </ul>
      )}
      {canCreate && (
        <div className={styles.buttons}>
          <label className={styles.inlineSelect}>
            <span className="sr-only">Categoria da pergunta nova</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as InterviewCategory)}
            >
              {INTERVIEW_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {INTERVIEW_CATEGORY_LABELS[item]}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={create.isPending}>
            Adicionar como pergunta nova
          </Button>
        </div>
      )}
    </form>
  );
}
