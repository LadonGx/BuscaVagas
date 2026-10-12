import { SCORE_TIER_MIN } from '@busca-vagas/shared';
import { LoaderCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { keys } from '../../api/keys';
import { useJobCounts } from '../../api/overview';
import { Button } from '../../components/ui/Button';
import { unsavedLabel } from '../../components/UnsavedChanges';
import { formatNumber } from '../../lib/format';
import styles from './Preferencias.module.css';

interface ScorePreviewProps {
  configured: boolean;
  dirtyCount: number;
  saving: boolean;
  onSave: () => void;
}

/**
 * "Com estas preferências": as faixas de nota das vagas na caixa e salvas,
 * com as preferências **salvas**. Enquanto a fila recalcula, confere a cada
 * 3 s; quando termina, recarrega as listas e o painel.
 */
export function ScorePreview({ configured, dirtyCount, saving, onSave }: ScorePreviewProps) {
  const { data: counts } = useJobCounts({ pollWhilePending: true });
  const queryClient = useQueryClient();
  const pending = counts?.score.pending ?? 0;
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && pending === 0) {
      void queryClient.invalidateQueries({ queryKey: keys.jobs.lists });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
    }
    wasPending.current = pending > 0;
  }, [pending, queryClient]);

  const tiles = counts
    ? [
        {
          tone: 'great',
          value: counts.score.great,
          label: `nota ≥ ${formatNumber(SCORE_TIER_MIN.great)}`,
        },
        {
          tone: 'good',
          value: counts.score.good,
          label: `${formatNumber(SCORE_TIER_MIN.good)}–${formatNumber(SCORE_TIER_MIN.great - 1)}`,
        },
        { tone: 'bad', value: counts.score.incompatible, label: 'incompatíveis' },
      ]
    : [];

  return (
    <section className={styles.card} aria-labelledby="previa-titulo">
      <h2 id="previa-titulo" className={styles.cardTitle}>
        Com estas preferências
      </h2>

      {configured ? (
        <div className={styles.tiles} data-stale={pending > 0 || undefined}>
          {tiles.map((tile) => (
            <div key={tile.tone} className={styles.tile} data-tone={tile.tone}>
              {/* Na fila as vagas saem das faixas: o número só vale quando terminar. */}
              <span className={styles.tileValue}>
                {pending > 0 ? '…' : formatNumber(tile.value)}
              </span>
              <span className={styles.tileLabel}>{tile.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.hint}>
          Sem preferências salvas, as vagas não têm nota e a lista sai pela data de entrada.
        </p>
      )}

      <p className={styles.previewStatus} role="status">
        {pending > 0 ? (
          <>
            <LoaderCircle size={14} className="spin" aria-hidden="true" />
            Recalculando notas… faltam {formatNumber(pending)}
          </>
        ) : dirtyCount > 0 ? (
          `${unsavedLabel(dirtyCount)}. Os números acima são das preferências salvas.`
        ) : configured ? (
          'Vagas na caixa de entrada e salvas.'
        ) : (
          ''
        )}
      </p>

      <Button
        variant="primary"
        className={styles.saveButton}
        disabled={dirtyCount === 0 || saving}
        onClick={onSave}
      >
        {saving ? 'Salvando…' : 'Salvar e recalcular'}
      </Button>
      <p className={styles.hint}>
        Recalcula em segundo plano; as listas atualizam sozinhas. Ctrl+S também salva.
      </p>
    </section>
  );
}
