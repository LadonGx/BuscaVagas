import type { RetentionReportDto } from '@busca-vagas/shared';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useRetention, useRunRetention } from '../../api/maintenance';
import { useToast } from '../../components/toast/toast-context';
import { Button } from '../../components/ui/Button';
import { formatNumber } from '../../lib/format';
import styles from './Preferencias.module.css';

const count = (value: number, one: string, many: string) =>
  `${formatNumber(value)} ${value === 1 ? one : many}`;

/** O que a limpeza apaga, item por item, para a confirmação. */
export function cleanupLines(report: RetentionReportDto): string[] {
  const days = report.days;
  const lines: string[] = [];
  if (report.dismissed > 0) {
    lines.push(
      `${count(report.dismissed, 'vaga descartada', 'vagas descartadas')} há mais de ${days} dias — não ${report.dismissed === 1 ? 'volta' : 'voltam'} nas próximas buscas`,
    );
  }
  if (report.stale > 0) {
    lines.push(
      `${count(report.stale, 'vaga', 'vagas')} da caixa de entrada que a fonte não mostra há mais de ${days} dias (nunca ${report.stale === 1 ? 'salva nem descartada' : 'salvas nem descartadas'}) — se for republicada, volta como nova`,
    );
  }
  if (report.sourceRuns > 0) {
    lines.push(
      `${count(report.sourceRuns, 'registro', 'registros')} do histórico de buscas com mais de ${days} dias`,
    );
  }
  if (report.forgottenExpired > 0) {
    lines.push(
      `${count(report.forgottenExpired, 'bloqueio', 'bloqueios')} de vaga descartada há muito tempo — ${report.forgottenExpired === 1 ? 'ela pode' : 'elas podem'} voltar a aparecer nas buscas`,
    );
  }
  return lines;
}

/** Prévia da limpeza automática e "Limpar agora" com confirmação. */
export function CleanupCard() {
  const { data: report, isError, error } = useRetention();
  const run = useRunRetention();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const lines = report ? cleanupLines(report) : [];

  return (
    <section className={styles.card} aria-labelledby="limpeza-titulo">
      <h2 id="limpeza-titulo" className={styles.cardTitle}>
        Limpeza{report?.enabled ? ` (${report.days} dias)` : ''}
      </h2>
      {isError && <p className={styles.error}>{error.message}</p>}
      {report && !report.enabled && (
        <p className={styles.hint}>
          Desligada: <code>RETENTION_DAYS=0</code> no <code>.env</code>. Nada é apagado.
        </p>
      )}
      {report?.enabled && (
        <>
          <p className={styles.text}>
            {report.dismissed + report.stale === 0
              ? 'Nenhuma vaga para sair na próxima limpeza.'
              : `Na próxima limpeza saem ${count(report.dismissed, 'descartada', 'descartadas')} e ${count(report.stale, 'esquecida', 'esquecidas')} na caixa.`}
          </p>
          <p className={styles.hint}>
            Roda sozinha uma vez por dia. Salvas e vagas com candidatura nunca saem.
          </p>

          {confirming ? (
            <div className={styles.confirm} role="alertdialog" aria-labelledby="limpeza-confirma">
              <p id="limpeza-confirma" className={styles.text}>
                <strong>Vai apagar agora, sem como desfazer:</strong>
              </p>
              <ul className={styles.confirmList}>
                {lines.map((line) => (
                  <li key={line}>{line}.</li>
                ))}
              </ul>
              <p className={styles.hint}>Salvas e vagas com candidatura ficam.</p>
              <div className={styles.buttons}>
                <Button
                  className={styles.danger}
                  icon={<Trash2 size={16} aria-hidden="true" />}
                  disabled={run.isPending}
                  onClick={() =>
                    run.mutate(undefined, {
                      onSuccess: (done) => {
                        setConfirming(false);
                        toast.show({
                          tone: 'success',
                          message: `Limpeza feita: ${count(done.dismissed, 'descartada', 'descartadas')} e ${count(done.stale, 'esquecida', 'esquecidas')} apagadas.`,
                        });
                      },
                      onError: (runError) =>
                        toast.show({ tone: 'error', message: runError.message }),
                    })
                  }
                >
                  {run.isPending ? 'Apagando…' : 'Apagar agora'}
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <Button
              icon={<Trash2 size={16} aria-hidden="true" />}
              disabled={lines.length === 0}
              title={lines.length === 0 ? 'Nada para limpar agora' : undefined}
              onClick={() => setConfirming(true)}
            >
              Limpar agora
            </Button>
          )}
        </>
      )}
    </section>
  );
}
