import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUSES,
  type ApplicationDetailDto,
  type ApplicationStatus,
  type StatusEventDto,
} from '@busca-vagas/shared';
import { CalendarClock, ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  useAddEvent,
  useApplication,
  useDeleteApplication,
  useDeleteEvent,
  useUpdateApplication,
  useUpdateEvent,
} from '../../api/applications';
import { ApplicationStatusChip, STATUS_TONE } from '../../components/job/Chips';
import { useToast } from '../../components/toast/toast-context';
import { Button } from '../../components/ui/Button';
import { Drawer } from '../../components/ui/Drawer';
import { Field } from '../../components/ui/Field';
import { formatDate, formatDateTime, fromLocalInput, toLocalInput } from '../../lib/format';
import { ApplicationResume } from './ApplicationResume';
import { isOpen } from './columns';
import styles from './ApplicationDrawer.module.css';

/** Status sugerido para a próxima etapa registrada. */
const NEXT_STATUS: Record<ApplicationStatus, ApplicationStatus> = {
  applied: 'in_process',
  in_process: 'in_process',
  offer: 'offer',
  rejected: 'rejected',
  withdrawn: 'withdrawn',
};

interface ApplicationDrawerProps {
  id: string | null;
  onClose: () => void;
}

/** Detalhe da candidatura: próxima etapa, linha do tempo e dados do processo. */
export function ApplicationDrawer({ id, onClose }: ApplicationDrawerProps) {
  const { data, isError, error } = useApplication(id);
  const application = data?.id === id ? data : undefined;

  return (
    <Drawer
      open={Boolean(id)}
      onClose={onClose}
      eyebrow={application?.job.company}
      title={application?.job.title ?? (isError ? 'Candidatura não encontrada' : 'Carregando…')}
      footer={application && <DeleteApplication application={application} onDeleted={onClose} />}
    >
      {isError && <p className={styles.muted}>{error.message}</p>}
      {application && <Details key={application.id} application={application} />}
    </Drawer>
  );
}

function Details({ application }: { application: ApplicationDetailDto }) {
  const { job } = application;
  return (
    <>
      <div className={styles.summary}>
        <ApplicationStatusChip status={application.status} />
        <span className={styles.muted}>Aplicada em {formatDate(application.appliedAt)}</span>
        <Link className={styles.inlineLink} to={`/vagas?vaga=${job.id}`}>
          Ver vaga
        </Link>
        {job.url && (
          <a className={styles.inlineLink} href={job.url} target="_blank" rel="noreferrer noopener">
            <ExternalLink size={14} aria-hidden="true" />
            Site
          </a>
        )}
      </div>

      {isOpen(application) && <NextStep application={application} />}
      <AddEvent application={application} />
      <Timeline application={application} />
      <ApplicationResume application={application} />
      <ProcessInfo application={application} />
    </>
  );
}

/* --------------------------------------------------------- próxima etapa */

function NextStep({ application }: { application: ApplicationDetailDto }) {
  const update = useUpdateApplication(application.id);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [when, setWhen] = useState(
    application.nextStepAt ? toLocalInput(application.nextStepAt) : '',
  );
  const [note, setNote] = useState(application.nextStepNote ?? '');

  function save(event: FormEvent) {
    event.preventDefault();
    update.mutate(
      { nextStepAt: when ? new Date(fromLocalInput(when)) : null, nextStepNote: note },
      {
        onSuccess: () => setEditing(false),
        onError: (error) => toast.show({ tone: 'error', message: error.message }),
      },
    );
  }

  if (editing) {
    return (
      <form className={styles.box} onSubmit={save}>
        <h3 className={styles.label}>Próxima etapa</h3>
        <div className={styles.grid}>
          <Field label="Quando">
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          <Field label="O quê">
            <input
              value={note}
              maxLength={500}
              placeholder="Entrevista técnica, teste…"
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </div>
        <div className={styles.buttons}>
          <Button type="submit" variant="primary" disabled={update.isPending}>
            Salvar etapa
          </Button>
          <Button variant="ghost" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className={styles.next} data-empty={!application.nextStepAt || undefined}>
      <CalendarClock size={18} aria-hidden="true" />
      <p>
        {application.nextStepAt ? (
          <>
            Próxima etapa: <strong>{application.nextStepNote || 'sem descrição'}</strong> —{' '}
            {formatDateTime(application.nextStepAt)}
          </>
        ) : (
          'Nenhuma próxima etapa marcada.'
        )}
      </p>
      <button type="button" className={styles.iconButton} onClick={() => setEditing(true)}>
        {application.nextStepAt ? 'Editar' : 'Marcar'}
      </button>
      {application.nextStepAt && (
        <button
          type="button"
          className={styles.iconButton}
          onClick={() =>
            update.mutate(
              { nextStepAt: null, nextStepNote: null },
              { onError: (error) => toast.show({ tone: 'error', message: error.message }) },
            )
          }
        >
          Limpar
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------- registrar etapa */

function AddEvent({ application }: { application: ApplicationDetailDto }) {
  const add = useAddEvent(application.id);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ApplicationStatus>(NEXT_STATUS[application.status]);
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');

  function start() {
    setStatus(NEXT_STATUS[application.status]);
    setWhen(toLocalInput(new Date()));
    setNote('');
    setOpen(true);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    add.mutate(
      { status, occurredAt: when ? new Date(fromLocalInput(when)) : undefined, note },
      {
        onSuccess: () => {
          setOpen(false);
          toast.show({ tone: 'success', message: 'Etapa registrada.' });
        },
        onError: (error) => toast.show({ tone: 'error', message: error.message }),
      },
    );
  }

  if (!open) {
    return (
      <div>
        <Button variant="primary" onClick={start}>
          Registrar etapa
        </Button>
      </div>
    );
  }

  return (
    <form className={styles.box} onSubmit={submit}>
      <h3 className={styles.label}>Registrar etapa</h3>
      <div className={styles.grid}>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as ApplicationStatus)}>
            {APPLICATION_STATUSES.map((value) => (
              <option key={value} value={value}>
                {APPLICATION_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Quando aconteceu" hint="Data futura vai em “Próxima etapa”.">
          <input
            type="datetime-local"
            value={when}
            max={toLocalInput(new Date())}
            onChange={(e) => setWhen(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Anotação">
        <textarea
          value={note}
          maxLength={1000}
          placeholder="RH ligou; conversa de 20 min…"
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <div className={styles.buttons}>
        <Button type="submit" variant="primary" disabled={add.isPending}>
          Registrar
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/* --------------------------------------------------------- linha do tempo */

function Timeline({ application }: { application: ApplicationDetailDto }) {
  const events = [...application.events].reverse();
  const single = application.events.length === 1;

  return (
    <section className={styles.section}>
      <h3 className={styles.label}>Linha do tempo</h3>
      <ol className={styles.timeline}>
        {events.map((event) => (
          <TimelineItem
            key={event.id}
            applicationId={application.id}
            event={event}
            single={single}
          />
        ))}
      </ol>
    </section>
  );
}

function TimelineItem({
  applicationId,
  event,
  single,
}: {
  applicationId: string;
  event: StatusEventDto;
  single: boolean;
}) {
  const update = useUpdateEvent(applicationId);
  const remove = useDeleteEvent();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [when, setWhen] = useState(toLocalInput(event.occurredAt));
  const [note, setNote] = useState(event.note ?? '');

  function save(formEvent: FormEvent) {
    formEvent.preventDefault();
    update.mutate(
      { eventId: event.id, occurredAt: new Date(fromLocalInput(when)), note },
      {
        onSuccess: () => setEditing(false),
        onError: (error) => toast.show({ tone: 'error', message: error.message }),
      },
    );
  }

  return (
    <li className={styles.event}>
      <span className={styles.eventDot} data-tone={STATUS_TONE[event.status]} aria-hidden="true" />
      {editing ? (
        <form className={styles.eventBody} onSubmit={save}>
          <span className={styles.eventTitle}>{APPLICATION_STATUS_LABELS[event.status]}</span>
          <Field label="Quando aconteceu">
            <input
              type="datetime-local"
              value={when}
              max={toLocalInput(new Date())}
              onChange={(e) => setWhen(e.target.value)}
            />
          </Field>
          <Field label="Anotação">
            <textarea value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className={styles.buttons}>
            <Button type="submit" variant="primary" disabled={update.isPending}>
              Salvar
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <div className={styles.eventBody}>
          <span className={styles.eventTitle}>
            {APPLICATION_STATUS_LABELS[event.status]}
            {event.previousStatus && (
              <span className={styles.muted}>
                {' '}
                (antes: {APPLICATION_STATUS_LABELS[event.previousStatus].toLowerCase()})
              </span>
            )}
          </span>
          <time className={styles.muted} dateTime={event.occurredAt}>
            {formatDateTime(event.occurredAt)}
          </time>
          {event.note && <p className={styles.eventNote}>{event.note}</p>}
          <div className={styles.eventActions}>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={`Editar etapa ${APPLICATION_STATUS_LABELS[event.status]}`}
              onClick={() => setEditing(true)}
            >
              <Pencil size={14} aria-hidden="true" /> Editar
            </button>
            <button
              type="button"
              className={styles.iconButton}
              disabled={single || remove.isPending}
              title={
                single ? 'É o único evento — para desfazer tudo, apague a candidatura.' : undefined
              }
              aria-label={`Apagar etapa ${APPLICATION_STATUS_LABELS[event.status]}`}
              onClick={() =>
                remove.mutate(
                  { id: applicationId, eventId: event.id },
                  { onError: (error) => toast.show({ tone: 'error', message: error.message }) },
                )
              }
            >
              <Trash2 size={14} aria-hidden="true" /> Apagar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/* --------------------------------------------------- dados do processo */

function ProcessInfo({ application }: { application: ApplicationDetailDto }) {
  const update = useUpdateApplication(application.id);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [via, setVia] = useState(application.appliedVia ?? '');
  const [salary, setSalary] = useState(
    application.salaryExpectation === null ? '' : String(application.salaryExpectation),
  );
  const [notes, setNotes] = useState(application.notes ?? '');

  function save(event: FormEvent) {
    event.preventDefault();
    update.mutate(
      {
        appliedVia: via,
        salaryExpectation: salary.trim() ? Number(salary) : null,
        notes,
      },
      {
        onSuccess: () => setEditing(false),
        onError: (error) => toast.show({ tone: 'error', message: error.message }),
      },
    );
  }

  if (editing) {
    return (
      <form className={styles.box} onSubmit={save}>
        <h3 className={styles.label}>Dados do processo</h3>
        <div className={styles.grid}>
          <Field label="Onde se candidatou">
            <input
              value={via}
              maxLength={100}
              placeholder="Gupy, LinkedIn, indicação…"
              onChange={(e) => setVia(e.target.value)}
            />
          </Field>
          <Field label="Pretensão salarial (R$/mês)">
            <input
              type="number"
              min={0}
              step={100}
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Anotações">
          <textarea value={notes} maxLength={5000} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className={styles.buttons}>
          <Button type="submit" variant="primary" disabled={update.isPending}>
            Salvar
          </Button>
          <Button variant="ghost" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        </div>
      </form>
    );
  }

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h3 className={styles.label}>Dados do processo</h3>
        <button type="button" className={styles.iconButton} onClick={() => setEditing(true)}>
          <Pencil size={14} aria-hidden="true" /> Editar
        </button>
      </div>
      <dl className={styles.info}>
        <dt>Onde se candidatou</dt>
        <dd>{application.appliedVia ?? '—'}</dd>
        <dt>Pretensão</dt>
        <dd>
          {application.salaryExpectation === null
            ? '—'
            : `R$ ${application.salaryExpectation.toLocaleString('pt-BR')}/mês`}
        </dd>
        <dt>Anotações</dt>
        <dd className={styles.notes}>{application.notes ?? '—'}</dd>
      </dl>
    </section>
  );
}

/* ---------------------------------------------------------------- apagar */

function DeleteApplication({
  application,
  onDeleted,
}: {
  application: ApplicationDetailDto;
  onDeleted: () => void;
}) {
  const remove = useDeleteApplication();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  // O segundo clique precisa vir logo: depois de 5 s, volta ao normal.
  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 5_000);
    return () => clearTimeout(timer);
  }, [confirming]);

  return (
    <Button
      variant="ghost"
      className={confirming ? styles.danger : undefined}
      disabled={remove.isPending}
      onClick={() => {
        if (!confirming) {
          setConfirming(true);
          return;
        }
        remove.mutate(application.id, {
          onSuccess: () => {
            toast.show({ message: 'Candidatura apagada. A vaga continua salva.' });
            onDeleted();
          },
          onError: (error) => toast.show({ tone: 'error', message: error.message }),
        });
      }}
    >
      <Trash2 size={16} aria-hidden="true" />
      {confirming ? 'Clique de novo para apagar' : 'Apagar candidatura'}
    </Button>
  );
}
