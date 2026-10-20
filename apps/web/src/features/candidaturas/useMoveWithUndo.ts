import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from '@busca-vagas/shared';
import { useCallback } from 'react';
import { newestEventId, useDeleteEvent, useMoveApplication } from '../../api/applications';
import { useToast } from '../../components/toast/toast-context';
import { columnOf } from './columns';

/** "Movida para Em processo." / "Movida para Encerradas (Desisti)." */
export function moveMessage(status: ApplicationStatus): string {
  const column = columnOf(status);
  const label = APPLICATION_STATUS_LABELS[status];
  return column.title === label
    ? `Movida para ${label}.`
    : `Movida para ${column.title} (${label}).`;
}

/**
 * Mover de coluna (registra o evento com a data de agora) com aviso e
 * "Desfazer", que apaga o evento recém-criado. A data pode ser corrigida
 * depois na linha do tempo.
 */
export function useMoveWithUndo() {
  const move = useMoveApplication();
  const deleteEvent = useDeleteEvent();
  const toast = useToast();

  return useCallback(
    (id: string, status: ApplicationStatus) => {
      // `mutateAsync` por chamada: os callbacks do `mutate` só rodam para a
      // última chamada, e mover dois cartões em seguida perderia um aviso.
      const showError = (error: Error) => toast.show({ tone: 'error', message: error.message });
      void move.mutateAsync({ id, status }).then((detail) => {
        const eventId = newestEventId(detail);
        toast.show({
          tone: 'success',
          message: moveMessage(status),
          action: eventId
            ? {
                label: 'Desfazer',
                onClick: () => {
                  void deleteEvent.mutateAsync({ id, eventId }).catch(showError);
                },
              }
            : undefined,
        });
      }, showError);
    },
    [move, deleteEvent, toast],
  );
}
