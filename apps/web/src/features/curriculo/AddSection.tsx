import { RESUME_SECTION_KINDS, type ResumeSectionKind } from '@busca-vagas/shared';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useCreateSection } from '../../api/resume';
import { useToast } from '../../components/toast/toast-context';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import styles from './Section.module.css';

const KIND_INFO: Record<ResumeSectionKind, { label: string; hint: string }> = {
  fields: { label: 'Campos', hint: 'Rótulo e valor, como E-mail ou Idiomas.' },
  text: { label: 'Texto', hint: 'Um bloco livre, como o Resumo.' },
  entries: { label: 'Entradas', hint: 'Itens com período, como Experiência.' },
};

/** Seção nova no fim do currículo. */
export function AddSection() {
  const create = useCreateSection();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<ResumeSectionKind>('fields');
  const [error, setError] = useState<string>();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError('Preencha este campo.');
      return;
    }
    create.mutate(
      { title: title.trim(), kind },
      {
        onSuccess: (section) => {
          toast.show({ tone: 'success', message: `Seção "${section.title}" criada no fim.` });
          setOpen(false);
          setTitle('');
          setKind('fields');
        },
        onError: (apiError) => toast.show({ tone: 'error', message: apiError.message }),
      },
    );
  }

  if (!open) {
    return (
      <Button
        className={styles.addSection}
        icon={<Plus size={16} aria-hidden="true" />}
        onClick={() => setOpen(true)}
      >
        Adicionar seção
      </Button>
    );
  }

  return (
    <form className={styles.card} aria-label="Nova seção" noValidate onSubmit={submit}>
      <h2 className={styles.title}>Nova seção</h2>
      <Field label="Nome" required error={error}>
        <input
          value={title}
          maxLength={80}
          placeholder="Ex.: Voluntariado"
          autoFocus
          onChange={(event) => {
            setTitle(event.target.value);
            setError(undefined);
          }}
        />
      </Field>
      <fieldset className={styles.kinds}>
        <legend className={styles.legend}>Tipo</legend>
        {RESUME_SECTION_KINDS.map((option) => (
          <label key={option} className={styles.kind}>
            <input
              type="radio"
              name="kind"
              value={option}
              checked={kind === option}
              onChange={() => setKind(option)}
            />
            <span>
              <strong>{KIND_INFO[option].label}</strong>
              <span className={styles.muted}>{KIND_INFO[option].hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className={styles.muted}>O tipo não muda depois de criada.</p>
      <div className={styles.formFooter}>
        <Button type="submit" variant="primary" disabled={create.isPending}>
          Criar seção
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
