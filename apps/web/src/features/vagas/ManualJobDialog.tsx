import {
  CONTRACT_LABELS,
  CONTRACT_TYPES,
  createJobInputSchema,
  SENIORITY_LABELS,
  SENIORITY_LEVELS,
  WORK_MODEL_LABELS,
  WORK_MODELS,
} from '@busca-vagas/shared';
import { useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { useCreateJob } from '../../api/jobs';
import { useToast } from '../../components/toast/toast-context';
import { Button } from '../../components/ui/Button';
import { Drawer } from '../../components/ui/Drawer';
import { Field } from '../../components/ui/Field';
import styles from './ManualJobDialog.module.css';

interface ManualJobDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (jobId: string) => void;
}

const EMPTY = {
  title: '',
  company: '',
  url: '',
  location: '',
  workModel: '',
  contractType: '',
  seniority: '',
  stack: '',
  notes: '',
};
type FormState = typeof EMPTY;
type Errors = Partial<Record<keyof FormState | 'form', string>>;

/** Formulário → entrada da API. Vazio vira `null` (o schema do `shared` decide). */
export function toCreateInput(form: FormState) {
  return {
    title: form.title,
    company: form.company,
    url: form.url.trim() || null,
    location: form.location,
    workModel: form.workModel || null,
    contractType: form.contractType || null,
    seniority: form.seniority || null,
    stack: form.stack
      .split(',')
      .map((tech) => tech.trim())
      .filter(Boolean),
    notes: form.notes,
  };
}

/**
 * "+ Vaga manual": indicação, vaga do LinkedIn, e-mail de recrutador... Valida
 * com o mesmo schema da API antes de enviar.
 */
export function ManualJobDialog({ open, onClose, onCreated }: ManualJobDialogProps) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const create = useCreateJob();
  const toast = useToast();

  const set = (name: keyof FormState) => (value: string) =>
    setForm((f) => ({ ...f, [name]: value }));

  function close() {
    setForm(EMPTY);
    setErrors({});
    onClose();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = createJobInputSchema.safeParse(toCreateInput(form));

    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]) as keyof FormState;
        // Mensagens do Zod vêm em inglês; as de campo vazio viram texto nosso.
        next[key] ??= issue.code === 'too_small' ? 'Preencha este campo.' : issue.message;
      }
      setErrors(next);
      return;
    }

    setErrors({});
    create.mutate(parsed.data, {
      onSuccess: (job) => {
        toast.show({ tone: 'success', message: `Vaga "${job.title}" adicionada à caixa.` });
        close();
        onCreated?.(job.id);
      },
      onError: (error) => {
        const message =
          error instanceof ApiError && error.status === 409
            ? 'Essa vaga já está no BuscaVagas (mesmo link).'
            : error.message;
        setErrors({ form: message });
      },
    });
  }

  return (
    <Drawer
      open={open}
      onClose={close}
      placement="center"
      title="Adicionar vaga"
      eyebrow="Indicação, LinkedIn, e-mail de recrutador…"
      footer={
        <>
          <Button type="submit" form="vaga-manual" variant="primary" disabled={create.isPending}>
            {create.isPending ? 'Salvando…' : 'Adicionar'}
          </Button>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
        </>
      }
    >
      <form id="vaga-manual" className={styles.form} onSubmit={submit} noValidate>
        {errors.form && (
          <p className={styles.formError} role="alert">
            {errors.form}
          </p>
        )}
        <div className={styles.grid}>
          <Field label="Título" required error={errors.title}>
            <input value={form.title} onChange={(e) => set('title')(e.target.value)} />
          </Field>
          <Field label="Empresa" required error={errors.company}>
            <input value={form.company} onChange={(e) => set('company')(e.target.value)} />
          </Field>
        </div>
        <Field
          label="Link da vaga"
          error={errors.url}
          hint="Evita cadastrar a mesma vaga duas vezes."
        >
          <input
            type="url"
            inputMode="url"
            placeholder="https://"
            value={form.url}
            onChange={(e) => set('url')(e.target.value)}
          />
        </Field>
        <div className={styles.grid}>
          <Field label="Local" error={errors.location}>
            <input
              placeholder="Campinas, SP"
              value={form.location}
              onChange={(e) => set('location')(e.target.value)}
            />
          </Field>
          <Field label="Modalidade" error={errors.workModel}>
            <select value={form.workModel} onChange={(e) => set('workModel')(e.target.value)}>
              <option value="">Não informada</option>
              {WORK_MODELS.map((value) => (
                <option key={value} value={value}>
                  {WORK_MODEL_LABELS[value]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Contrato" error={errors.contractType}>
            <select value={form.contractType} onChange={(e) => set('contractType')(e.target.value)}>
              <option value="">Não informado</option>
              {CONTRACT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {CONTRACT_LABELS[value]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Senioridade" error={errors.seniority}>
            <select value={form.seniority} onChange={(e) => set('seniority')(e.target.value)}>
              <option value="">Não informada</option>
              {SENIORITY_LEVELS.map((value) => (
                <option key={value} value={value}>
                  {SENIORITY_LABELS[value]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Stack" error={errors.stack} hint="Separada por vírgula: node.js, react">
          <input value={form.stack} onChange={(e) => set('stack')(e.target.value)} />
        </Field>
        <Field label="Anotações" error={errors.notes}>
          <textarea
            value={form.notes}
            placeholder="Quem indicou, contato do recrutador…"
            onChange={(e) => set('notes')(e.target.value)}
          />
        </Field>
      </form>
    </Drawer>
  );
}
