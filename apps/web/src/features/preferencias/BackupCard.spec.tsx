import type { BackupInspectDto } from '@busca-vagas/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi } from '../../test/api-mock';
import { layoutRoutes } from '../../test/fixtures';
import { renderApp } from '../../test/render';

const info = (problem: string | null = null): BackupInspectDto => ({
  manifest: {
    app: 'BuscaVagas',
    format: 1,
    createdAt: '2026-10-14T18:30:00.000Z',
    migrations: null,
    counts: { Job: 123, Application: 9, ApplicationFile: 1, ResumeItem: 0 },
  },
  problem,
});

function setup(inspect: BackupInspectDto = info()) {
  const calls: { path: string; type: string | undefined; isFile: boolean }[] = [];
  const record = (path: string, init: RequestInit) =>
    calls.push({
      path,
      type: (init.headers as Record<string, string> | undefined)?.['Content-Type'],
      isFile: init.body instanceof Blob,
    });
  mockApi({
    ...layoutRoutes(),
    'GET /preferences/stacks': () => [],
    'GET /resume/stacks': () => ({ scannedSections: [], stacks: [] }),
    'GET /maintenance/retention': () => ({
      enabled: true,
      days: 30,
      cutoff: '2026-09-12T00:00:00.000Z',
      dismissed: 0,
      stale: 0,
      sourceRuns: 0,
      forgottenExpired: 0,
      dryRun: true,
    }),
    'GET /discovery/runs': () => ({ items: [], nextCursor: null }),
    'POST /backup/inspect': (_u, init) => {
      record('/backup/inspect', init);
      return inspect;
    },
    'POST /backup/restore': (_u, init) => {
      record('/backup/restore', init);
      return {
        restored: { Job: 123 },
        safetyBackup: 'buscavagas-antes-de-restaurar-20261014-1830.zip',
      };
    },
  });
  return { calls };
}

const zip = () => new File(['PK...'], 'buscavagas-backup.zip', { type: 'application/zip' });

describe('Backup', () => {
  it('links para baixar o .zip e o CSV', async () => {
    setup();
    renderApp('/preferencias');
    const card = await screen.findByRole('region', { name: 'Backup' });
    expect(within(card).getByRole('link', { name: 'Baixar backup (.zip)' })).toHaveAttribute(
      'href',
      '/api/backup',
    );
    expect(within(card).getByRole('link', { name: 'Candidaturas (CSV)' })).toHaveAttribute(
      'href',
      '/api/backup/applications.csv',
    );
  });

  it('restaurar: lê o arquivo, mostra o que tem, pede confirmação e envia o .zip cru', async () => {
    const { calls } = setup();
    const user = userEvent.setup();
    renderApp('/preferencias');
    const card = await screen.findByRole('region', { name: 'Backup' });

    await user.upload(within(card).getByLabelText('Escolher o .zip do backup'), zip());
    const dialog = await within(card).findByRole('alertdialog');
    expect(dialog).toHaveTextContent('123 vagas, 9 candidaturas, 1 PDF enviado.');
    expect(dialog).toHaveTextContent('será substituído');
    expect(calls).toEqual([{ path: '/backup/inspect', type: 'application/zip', isFile: true }]);

    await user.click(within(dialog).getByRole('button', { name: 'Substituir tudo pelo backup' }));
    expect(
      await screen.findByText(
        /Backup restaurado.*buscavagas-antes-de-restaurar-20261014-1830\.zip/,
      ),
    ).toBeInTheDocument();
    expect(calls.at(-1)).toEqual({
      path: '/backup/restore',
      type: 'application/zip',
      isFile: true,
    });
    await waitFor(() => expect(within(card).queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('backup incompatível: mostra o motivo e não oferece restaurar', async () => {
    const { calls } = setup(info('Backup feito por uma versão mais nova do app.'));
    const user = userEvent.setup();
    renderApp('/preferencias');
    const card = await screen.findByRole('region', { name: 'Backup' });

    await user.upload(within(card).getByLabelText('Escolher o .zip do backup'), zip());
    const dialog = await within(card).findByRole('alertdialog');
    expect(dialog).toHaveTextContent('versão mais nova');
    expect(within(dialog).queryByRole('button', { name: /Substituir/ })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(
      within(card).getByRole('button', { name: 'Restaurar de um backup…' }),
    ).toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });
});
