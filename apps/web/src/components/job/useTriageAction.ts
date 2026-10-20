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

      // `mutateAsync` por chamada: os callbacks do `mutate` só rodam para a
      // última chamada, e triagens rápidas em sequência perderiam o aviso.
      const showError = (error: Error) => toast.show({ tone: 'error', message: error.message });
      void triage.mutateAsync({ job, status, reason }).then(
        () =>
          toast.show({
            tone: 'success',
            message: DONE[status],
            action: {
              label: 'Desfazer',
              onClick: () => {
                void triage
                  .mutateAsync({ job: changed, status: before.status, reason: before.reason })
                  .catch(showError);
              },
            },
          }),
        showError,
      );
    },
    [triage, toast],
  );
}
