import { LoaderCircle, RefreshCw } from 'lucide-react';
import { describeScan, isScanning, useScan, useSources } from '../api/discovery';
import { useToast } from './toast/toast-context';
import { Button } from './ui/Button';

/**
 * "Buscar agora": enfileira todas as fontes ativas. Fica ocupado enquanto
 * alguma fonte estiver rodando (a fila diz, não um estado local).
 */
export function ScanButton() {
  const toast = useToast();
  const { data: sources } = useSources();
  const scan = useScan();
  const busy = scan.isPending || isScanning(sources);

  return (
    <Button
      variant="primary"
      disabled={busy}
      icon={
        busy ? (
          <LoaderCircle size={16} aria-hidden="true" className="spin" />
        ) : (
          <RefreshCw size={16} aria-hidden="true" />
        )
      }
      onClick={() =>
        scan.mutate(undefined, {
          onSuccess: (result) => toast.show({ message: describeScan(result, sources) }),
          onError: (error) => toast.show({ tone: 'error', message: error.message }),
        })
      }
    >
      {busy ? 'Buscando…' : 'Buscar agora'}
    </Button>
  );
}
