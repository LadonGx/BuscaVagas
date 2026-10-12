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
      move.mutate(
        { id, status },
        {
          onSuccess: (detail) => {
            const eventId = newestEventId(detail);
            toast.show({
              tone: 'success',
              message: moveMessage(status),
              action: eventId
                ? {
                    label: 'Desfazer',
                    onClick: () =>
                      deleteEvent.mutate(
                        { id, eventId },
                        {
                          onError: (error) => toast.show({ tone: 'error', message: error.message }),
                        },
                      ),
                  }
                : undefined,
            });
          },
          onError: (error) => toast.show({ tone: 'error', message: error.message }),
        },
      );
    },
    [move, deleteEvent, toast],
  );
}
