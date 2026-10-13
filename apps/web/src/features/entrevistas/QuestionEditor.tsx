import {
  hasStar,
  INTERVIEW_CATEGORIES,
  INTERVIEW_CATEGORY_LABELS,
  parseTags,
  STAR_FIELDS,
  type InterviewCategory,
  type InterviewQuestionDto,
} from '@busca-vagas/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useCreateQuestion, useDeleteQuestion, useUpdateQuestion } from '../../api/interviews';
import { useToast } from '../../components/toast/toast-context';
import { Button } from '../../components/ui/Button';
import { Drawer } from '../../components/ui/Drawer';
import { Field } from '../../components/ui/Field';
import { formatAgo, formatDate } from '../../lib/format';
import styles from './Entrevistas.module.css';

type StarKey = (typeof STAR_FIELDS)[number][0];

interface Form {
  question: string;
  category: InterviewCategory;
  tags: string;
  answer: string;
  starSituation: string;
  starTask: string;
  starAction: string;
  starResult: string;
}

const STAR_HINTS: Record<StarKey, string> = {
  starSituation: 'O contexto: onde, quando, qual era o problema.',
  starTask: 'O que cabia a você.',
  starAction: 'O que você fez (você, não o time).',
  starResult: 'O que mudou — com número, se tiver.',
};

export function formFrom(question: InterviewQuestionDto | null): Form {
  return {
    question: question?.question ?? '',
    category: question?.category ?? 'hr',
    tags: question?.tags.join(', ') ?? '',
    answer: question?.answer ?? '',
    starSituation: question?.starSituation ?? '',
    starTask: question?.starTask ?? '',
    starAction: question?.starAction ?? '',
    starResult: question?.starResult ?? '',
  };
}

const sameForm = (a: Form, b: Form) =>
  (Object.keys(a) as (keyof Form)[]).every((key) =>
    key === 'tags'
      ? parseTags(a.tags).join(',') === parseTags(b.tags).join(',')
      : a[key].trim() === b[key].trim(),
  );

const RATING_TEXT = { good: 'fui bem', again: 'preciso treinar' } as const;

/**
 * Editor de uma pergunta no painel lateral: pergunta, categoria, tags,
 * resposta em texto e, opcional, no formato STAR. `question = null` = nova.
 */
export function QuestionEditor({
  question,
  onClose,
  onCreated,
}: {
  question: InterviewQuestionDto | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const initial = formFrom(question);
  const [form, setForm] = useState(initial);
  const [star, setStar] = useState(
    question
      ? hasStar(question) || (question.category === 'behavioral' && !question.answer)
      : false,
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const create = useCreateQuestion();
  const update = useUpdateQuestion();
  const remove = useDeleteQuestion();
  const toast = useToast();
  const dirty = !sameForm(form, initial);
  const saving = create.isPending || update.isPending;

  const set = (key: keyof Form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  function requestClose() {
    if (dirty) setConfirmClose(true);
    else onClose();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (form.question.trim().length < 3) {
      setError('Escreva a pergunta.');
      return;
    }
    setError(null);
    const input = {
      question: form.question,
      category: form.category,
      tags: parseTags(form.tags),
      answer: form.answer,
      starSituation: form.starSituation,
      starTask: form.starTask,
      starAction: form.starAction,
      starResult: form.starResult,
    };
    const onError = (failure: Error) => toast.show({ tone: 'error', message: failure.message });
    if (question) {
      update.mutate(
        { id: question.id, input },
        {
          onSuccess: () => {
            toast.show({ tone: 'success', message: 'Pergunta salva.' });
            onClose();
          },
          onError,
        },
      );
    } else {
      create.mutate(input, {
        onSuccess: (created) => {
          toast.show({ tone: 'success', message: 'Pergunta criada.' });
          onCreated(created.id);
        },
        onError,
      });
    }
  }

  const footer = confirmClose ? (
    <div className={styles.confirmBar} role="group" aria-label="Alterações não salvas">
      <span>Descartar as alterações?</span>
      <Button variant="primary" onClick={onClose}>
        Descartar
      </Button>
      <Button variant="ghost" onClick={() => setConfirmClose(false)}>
        Continuar editando
      </Button>
    </div>
  ) : confirmDelete && question ? (
    <div className={styles.confirmBar} role="group" aria-label="Apagar a pergunta">
      <span>Apagar a pergunta e a sua resposta?</span>
      <Button
        variant="primary"
        disabled={remove.isPending}
        onClick={() =>
          remove.mutate(question.id, {
            onSuccess: () => {
              toast.show({ tone: 'success', message: 'Pergunta apagada.' });
              onClose();
            },
            onError: (failure) => toast.show({ tone: 'error', message: failure.message }),
          })
        }
      >
        Apagar
      </Button>
      <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
        Cancelar
      </Button>
    </div>
  ) : (
    <>
      <Button type="submit" form="question-form" variant="primary" disabled={!dirty || saving}>
        {saving ? 'Salvando…' : question ? 'Salvar' : 'Criar pergunta'}
      </Button>
      <Button variant="ghost" onClick={requestClose}>
        {dirty ? 'Cancelar' : 'Fechar'}
      </Button>
      {question && (
        <Button variant="ghost" className={styles.pushRight} onClick={() => setConfirmDelete(true)}>
          Apagar…
        </Button>
      )}
    </>
  );

  return (
    <Drawer
      open
      onClose={requestClose}
      size="wide"
      eyebrow={question ? INTERVIEW_CATEGORY_LABELS[question.category] : 'Entrevistas'}
      title={question ? 'Editar pergunta' : 'Nova pergunta'}
      footer={footer}
    >
      <form id="question-form" className={styles.form} onSubmit={submit} noValidate>
        <Field label="Pergunta" error={error ?? undefined} required>
          <textarea
            rows={2}
            maxLength={500}
            value={form.question}
            onChange={(event) => set('question')(event.target.value)}
            autoFocus={!question}
          />
        </Field>

        <div className={styles.formRow}>
          <Field label="Categoria">
            <select
              value={form.category}
              onChange={(event) => {
                set('category')(event.target.value);
                // Comportamental sem resposta: o STAR já aparece aberto.
                if (event.target.value === 'behavioral' && !form.answer.trim()) setStar(true);
              }}
            >
              {INTERVIEW_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {INTERVIEW_CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tags" hint="Separadas por vírgula: react, conflito, salário">
            <input value={form.tags} onChange={(event) => set('tags')(event.target.value)} />
          </Field>
        </div>

        <Field
          label="Sua resposta"
          hint="Do jeito que você falaria. Tópicos curtos ajudam a lembrar."
        >
          <textarea
            rows={8}
            maxLength={10_000}
            value={form.answer}
            onChange={(event) => set('answer')(event.target.value)}
          />
        </Field>

        <div className={styles.star}>
          <button
            type="button"
            className={styles.starToggle}
            aria-expanded={star}
            onClick={() => setStar((open) => !open)}
          >
            {star ? 'Esconder STAR' : 'Responder no formato STAR'}
          </button>
          <span className={styles.muted}>
            Situação, Tarefa, Ação e Resultado — bom para perguntas comportamentais.
          </span>
        </div>
        {star && (
          <div className={styles.starFields}>
            {STAR_FIELDS.map(([key, label]) => (
              <Field key={key} label={label} hint={STAR_HINTS[key]}>
                <textarea
                  rows={3}
                  maxLength={3_000}
                  value={form[key]}
                  onChange={(event) => set(key)(event.target.value)}
                />
              </Field>
            ))}
          </div>
        )}
      </form>

      {question && (
        <section className={styles.block} aria-label="Onde caiu e treino">
          <h3 className={styles.label}>Caiu em</h3>
          {question.asked.length === 0 ? (
            <p className={styles.muted}>
              Nenhuma candidatura ainda. Marque no painel da candidatura quando ela cair.
            </p>
          ) : (
            <ul className={styles.askedList}>
              {question.asked.map((item) => (
                <li key={item.applicationId}>
                  <Link to={`/candidaturas/${item.applicationId}`}>
                    {item.jobTitle} · {item.company}
                  </Link>
                  <span className={styles.muted}> em {formatDate(item.askedAt)}</span>
                  {item.note && <p className={styles.note}>{item.note}</p>}
                </li>
              ))}
            </ul>
          )}
          <h3 className={styles.label}>Treino</h3>
          <p className={styles.muted}>
            {question.practice.count === 0
              ? 'Ainda não treinada.'
              : `Treinada ${question.practice.count === 1 ? '1 vez' : `${question.practice.count} vezes`}` +
                (question.practice.lastRating && question.practice.practicedAt
                  ? ` · última: ${RATING_TEXT[question.practice.lastRating]}, ${formatAgo(question.practice.practicedAt)}`
                  : '')}
          </p>
        </section>
      )}
    </Drawer>
  );
}
