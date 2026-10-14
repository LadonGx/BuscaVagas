import {
  notificationTitle,
  TRIAGE_LABELS,
  type NotificationDto,
  type NotificationJobDto,
} from '@busca-vagas/shared';
import { Bell } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  useMarkNotificationsRead,
  useNotifications,
  useNotificationSettings,
} from '../../api/notifications';
import { formatAgo, formatNumber } from '../../lib/format';
import { useToast } from '../toast/toast-context';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import styles from './NotificationBell.module.css';

/** Situação da vaga agora, quando não está mais "na caixa, aberta". */
export function jobStatus(job: NotificationJobDto): string | null {
  if (job.closed) return 'encerrada';
  if (job.triage !== 'inbox') return TRIAGE_LABELS[job.triage].toLowerCase();
  return null;
}

/**
 * Sino do menu: vagas novas com nota alta (docs/features/16-notifications.md).
 * Confere a cada minuto; aviso novo com o app aberto também vira um toast.
 */
export function NotificationBell() {
  const { data } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  /** Os que estavam por ler quando o sino abriu (continuam destacados). */
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const lastTop = useRef<string | null | undefined>(undefined);
  const unread = data?.unread ?? 0;

  const { mutate: markAllRead } = markRead;
  const openBell = useCallback(() => {
    setFresh(new Set(data?.items.filter((item) => !item.readAt).map((item) => item.id)));
    setOpen(true);
    if ((data?.unread ?? 0) > 0) markAllRead();
  }, [data, markAllRead]);

  // Aviso novo enquanto o app está aberto: toast com "Ver".
  const top = data?.items[0];
  useEffect(() => {
    if (!data) return;
    const previous = lastTop.current;
    lastTop.current = top?.id ?? null;
    if (previous === undefined || !top || top.id === previous || top.readAt) return;
    toast.show({
      tone: 'info',
      message: notificationTitle(top),
      action: { label: 'Ver', onClick: openBell },
      duration: 10_000,
    });
  }, [data, top, toast, openBell]);

  return (
    <>
      <button
        type="button"
        className={styles.bell}
        aria-label={unread > 0 ? `Avisos, ${formatNumber(unread)} novos` : 'Avisos'}
        aria-haspopup="dialog"
        onClick={openBell}
      >
        <Bell size={18} aria-hidden="true" />
        {unread > 0 && (
          <span className={styles.badge} aria-hidden="true">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Avisos"
        eyebrow="Vagas novas com nota alta"
      >
        <NotificationList
          items={data?.items ?? []}
          fresh={fresh}
          onOpenJob={() => setOpen(false)}
        />
      </Drawer>
    </>
  );
}

function NotificationList({
  items,
  fresh,
  onOpenJob,
}: {
  items: NotificationDto[];
  fresh: ReadonlySet<string>;
  onOpenJob: () => void;
}) {
  const { data: settings } = useNotificationSettings();
  const navigate = useNavigate();
  const off = settings?.minScore === 0;

  return (
    <div className={styles.panel}>
      <p className={styles.muted}>
        {off ? (
          <>
            Avisos desligados.{' '}
            <Link to="/preferencias#avisos" onClick={onOpenJob}>
              Ligar em Preferências
            </Link>
          </>
        ) : (
          <>
            Vagas que entraram com nota ≥ {settings?.minScore ?? 800}, juntas por busca.{' '}
            <Link to="/preferencias#avisos" onClick={onOpenJob}>
              Mudar a nota
            </Link>
          </>
        )}
      </p>

      {items.length === 0 ? (
        <p className={styles.empty}>Nenhum aviso ainda.</p>
      ) : (
        <ol className={styles.list}>
          {items.map((item) => (
            <li key={item.id} className={styles.item} data-fresh={fresh.has(item.id) || undefined}>
              <div className={styles.itemHead}>
                <strong>{notificationTitle(item)}</strong>
                {fresh.has(item.id) && <span className={styles.new}>novo</span>}
                <span className={styles.muted}>{formatAgo(item.createdAt)}</span>
              </div>
              {item.jobs.length === 0 ? (
                <p className={styles.muted}>As vagas deste aviso já saíram pela limpeza.</p>
              ) : (
                <ul className={styles.jobs}>
                  {item.jobs.map((job) => {
                    const status = jobStatus(job);
                    return (
                      <li key={job.id}>
                        <button
                          type="button"
                          className={styles.job}
                          onClick={() => {
                            onOpenJob();
                            void navigate(`/vagas?vaga=${job.id}`);
                          }}
                        >
                          <span className={styles.score}>{job.score ?? '—'}</span>
                          <span className={styles.jobText}>
                            <span className={styles.jobTitle}>{job.title}</span>
                            <span className={styles.muted}>
                              {job.company}
                              {status && ` · ${status}`}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}

      <Button
        variant="ghost"
        onClick={() => {
          onOpenJob();
          void navigate('/vagas?ordem=nota');
        }}
      >
        Ver a caixa pela nota
      </Button>
    </div>
  );
}
