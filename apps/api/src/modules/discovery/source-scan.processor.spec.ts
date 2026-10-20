import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import type { ScanJobData } from './discovery.constants';
import type { ScanRunner } from './scan-runner.service';
import { SourceScanProcessor } from './source-scan.processor';

const job = (sourceId: string, trigger: ScanJobData['trigger'] = 'manual') =>
  ({ data: { sourceId, terms: ['react'], trigger } }) as Job<ScanJobData>;

describe('SourceScanProcessor', () => {
  it('a mesma fonte nunca roda duas vezes ao mesmo tempo; fontes diferentes, sim', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const run = vi.fn(async (sourceId: string) => {
      if (sourceId === 'gupy') await gate;
      return { sourceId } as never;
    });
    const processor = new SourceScanProcessor({ run } as unknown as ScanRunner);

    const manual = processor.process(job('gupy'));
    // O agendador dispara a mesma fonte enquanto o botão ainda roda: pula.
    await expect(processor.process(job('gupy', 'schedule'))).resolves.toBeNull();
    await expect(processor.process(job('remotive'))).resolves.toEqual({ sourceId: 'remotive' });

    release();
    await expect(manual).resolves.toEqual({ sourceId: 'gupy' });
    expect(run).toHaveBeenCalledTimes(2);

    // Terminou (ou falhou): libera a fonte.
    await processor.process(job('gupy', 'schedule'));
    expect(run).toHaveBeenCalledTimes(3);
    run.mockRejectedValueOnce(new Error('caiu'));
    await expect(processor.process(job('gupy'))).rejects.toThrow('caiu');
    await processor.process(job('gupy'));
    expect(run).toHaveBeenCalledTimes(5);
  });
});
