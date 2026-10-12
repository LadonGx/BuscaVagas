import { Columns3, List } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useApplications } from '../../api/applications';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { useNow } from '../../lib/useNow';
import { ApplicationDrawer } from './ApplicationDrawer';
import { ApplicationsTable } from './ApplicationsTable';
import { Board } from './Board';
import { stepsWithin } from './columns';
import { useMoveWithUndo } from './useMoveWithUndo';
import styles from './CandidaturasPage.module.css';

/** Candidaturas: quadro por status (ou lista) e o detalhe em `/candidaturas/:id`. */
export function CandidaturasPage() {
  const { id = null } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = params.get('vista') === 'lista' ? 'list' : 'board';
  const { data: applications, isPending, isError, error, refetch } = useApplications();
  const move = useMoveWithUndo();
  const now = useNow(60_000);

  const setView = (next: 'board' | 'list') =>
    setParams((current) => {
      const copy = new URLSearchParams(current);
      if (next === 'list') copy.set('vista', 'lista');
      else copy.delete('vista');
      return copy;
    });
  const query = params.toString() ? `?${params.toString()}` : '';
  const open = (applicationId: string) => navigate(`/candidaturas/${applicationId}${query}`);
  const close = () => navigate(`/candidaturas${query}`);

  const total = applications?.length ?? 0;
  const thisWeek = applications ? stepsWithin(applications, now) : 0;
  const subtitle = applications
    ? `${total} no total · ${thisWeek} com próxima etapa nos próximos 7 dias`
    : 'Carregando…';

  return (
    <>
      <PageHeader
        title="Candidaturas"
        subtitle={subtitle}
        actions={
          <div className={styles.toggle} role="group" aria-label="Visualização">
            <button type="button" aria-pressed={view === 'board'} onClick={() => setView('board')}>
              <Columns3 size={16} aria-hidden="true" /> Quadro
            </button>
            <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
              <List size={16} aria-hidden="true" /> Lista
            </button>
          </div>
        }
      />

      {isPending ? (
        <p className={styles.muted}>Carregando candidaturas…</p>
      ) : isError ? (
        <EmptyState title="Não consegui carregar as candidaturas">
          <p>{error.message}</p>
          <Button onClick={() => void refetch()}>Tentar de novo</Button>
        </EmptyState>
      ) : total === 0 ? (
        <EmptyState title="Nenhuma candidatura ainda">
          Abra uma vaga em Vagas e clique em “Me candidatei” — ela aparece aqui, na coluna Aplicada.
        </EmptyState>
      ) : view === 'list' ? (
        <ApplicationsTable applications={applications} onOpen={open} />
      ) : (
        <div className={styles.scroll}>
          <Board
            applications={applications}
            now={now}
            selectedId={id}
            onOpen={open}
            onMove={move}
          />
        </div>
      )}

      <ApplicationDrawer id={id} onClose={close} />
    </>
  );
}
