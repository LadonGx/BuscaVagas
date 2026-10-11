import { describe, expect, it } from 'vitest';
import { nextRun } from '../components/layout/ScanStatus';
import { inactiveBoard, source } from '../test/fixtures';
import { describeScan, isScanning } from './discovery';

describe('descoberta no front', () => {
  it('resumo do "Buscar agora": curto, sem repetir o motivo de cada fonte', () => {
    const sources = [
      source(),
      inactiveBoard(),
      source({ id: 'lever', displayName: 'Lever', active: false }),
      source({ id: 'ashby', displayName: 'Ashby', active: false }),
    ];
    const reason = 'X_COMPANIES vazio';
    expect(
      describeScan(
        {
          queued: [],
          alreadyQueued: ['gupy'],
          inactive: ['greenhouse', 'lever', 'ashby'].map((sourceId) => ({ sourceId, reason })),
          unknown: [],
          terms: [],
        },
        sources,
      ),
    ).toBe(
      'Buscando em Gupy. Greenhouse, Lever e Ashby estão desligadas (o motivo aparece em Preferências → Fontes).',
    );
    expect(
      describeScan(
        {
          queued: [{ sourceId: 'gupy', jobId: '1' }],
          alreadyQueued: [],
          inactive: [{ sourceId: 'greenhouse', reason }],
          unknown: [],
          terms: [],
        },
        sources,
      ),
    ).toBe(
      'Buscando em Gupy. Greenhouse está desligada (o motivo aparece em Preferências → Fontes).',
    );
    expect(
      describeScan({ queued: [], alreadyQueued: [], inactive: [], unknown: [], terms: [] }),
    ).toBe('Nenhuma fonte ativa para buscar.');
  });

  it('rodando e próxima busca', () => {
    expect(isScanning([source(), source({ running: true })])).toBe(true);
    expect(isScanning(undefined)).toBe(false);
    expect(
      nextRun([
        source({ nextRunAt: '2026-10-11T20:00:00.000Z' }),
        source({ nextRunAt: '2026-10-11T18:00:00.000Z' }),
        source({ nextRunAt: null }),
      ]),
    ).toBe('2026-10-11T18:00:00.000Z');
    expect(nextRun([source({ nextRunAt: null })])).toBeNull();
  });
});
