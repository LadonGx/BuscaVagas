import type { JobDto, TriageStatus } from '@busca-vagas/shared';
import { useCallback } from 'react';
import { useTriage } from '../../api/jobs';
import { useToast } from '../toast/toast-context';

const DONE: Record<TriageStatus, string> = {
  saved: 'Vaga salva',
  dismissed: 'Vaga descartada',
  inbox: 'Vaga de volta na caixa',
};

/**
 * Triagem com aviso e "Desfazer". Desfazer volta exatamente ao estado de
 * antes (caixa ou salva, com o motivo de descarte se havia). Usado em Vagas e
 * no Deslizar.
 */
export function useTriageAction() {
  const triage = useTriage();
  const toast = useToast();

  return useCallback(
    (job: JobDto, status: TriageStatus, reason?: string | null) => {
      const before = { status: job.triage, reason: job.dismissReason };
      const changed: JobDto = {
        ...job,
        triage: status,
        dismissReason: status === 'dismissed' ? (reason ?? null) : null,
      };

      triage.mutate(
        { job, status, reason },
        {
          onSuccess: () =>
            toast.show({
              tone: 'success',
              message: DONE[status],
              action: {
                label: 'Desfazer',
                onClick: () =>
                  triage.mutate(
                    { job: changed, status: before.status, reason: before.reason },
                    {
                      onError: (error) => toast.show({ tone: 'error', message: error.message }),
                    },
                  ),
              },
            }),
          onError: (error) => toast.show({ tone: 'error', message: error.message }),
        },
      );
    },
    [triage, toast],
  );
}
