import { describe, expect, it } from 'vitest';
import {
  addStatusEventInputSchema,
  createApplicationInputSchema,
  deriveApplicationState,
  withPreviousStatus,
  type StatusEventLike,
} from './applications';

const at = (day: number, hour = 12) => new Date(Date.UTC(2026, 9, day, hour));

describe('deriveApplicationState', () => {
  it('status do evento mais recente e appliedAt do primeiro, mesmo fora de ordem', () => {
    const events: StatusEventLike[] = [
      { status: 'in_process', occurredAt: at(5), createdAt: at(5) },
      { status: 'rejected', occurredAt: at(9), createdAt: at(9) },
      // registrado depois, com data retroativa
      { status: 'applied', occurredAt: at(1), createdAt: at(10) },
    ];

    expect(deriveApplicationState(events)).toEqual({ status: 'rejected', appliedAt: at(1) });
  });

  it('empate na data: vence o registrado por último', () => {
    const events: StatusEventLike[] = [
      { status: 'in_process', occurredAt: at(5), createdAt: at(5, 10) },
      { status: 'offer', occurredAt: at(5), createdAt: at(5, 11) },
    ];

    expect(deriveApplicationState(events).status).toBe('offer');
  });

  it('histórico vazio é erro de programação', () => {
    expect(() => deriveApplicationState([])).toThrow();
  });
});

describe('withPreviousStatus', () => {
  it('ordena e anota o status anterior', () => {
    const result = withPreviousStatus([
      { status: 'offer' as const, occurredAt: at(8), createdAt: at(8) },
      { status: 'applied' as const, occurredAt: at(1), createdAt: at(1) },
      { status: 'in_process' as const, occurredAt: at(3), createdAt: at(3) },
    ]);

    expect(result.map((e) => [e.previousStatus, e.status])).toEqual([
      [null, 'applied'],
      ['applied', 'in_process'],
      ['in_process', 'offer'],
    ]);
  });
});

describe('entradas', () => {
  it('status padrão é applied', () => {
    expect(createApplicationInputSchema.parse({ jobId: 'x' }).status).toBe('applied');
  });

  it('recusa data de evento no futuro', () => {
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const result = addStatusEventInputSchema.safeParse({ status: 'offer', occurredAt: future });
    expect(result.success).toBe(false);
  });

  it('aceita data passada só com o dia', () => {
    const parsed = addStatusEventInputSchema.parse({
      status: 'rejected',
      occurredAt: '2026-10-01',
    });
    expect(parsed.occurredAt?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
});
