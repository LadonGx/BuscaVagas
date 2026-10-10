import { describe, expect, it } from 'vitest';
import { planSchedules, type ScheduleSpec } from './schedule-plan';

const SIX_HOURS = 6 * 60 * 60 * 1000;

const spec = (sourceId: string, everyMs = SIX_HOURS, terms = ['dev']): ScheduleSpec => ({
  id: `schedule:${sourceId}`,
  everyMs,
  data: { sourceId, terms, trigger: 'schedule' },
});

describe('planSchedules', () => {
  it('cria o que não existe', () => {
    expect(planSchedules([], [spec('gupy')])).toEqual({ upsert: [spec('gupy')], remove: [] });
  });

  it('não mexe no que já está igual (reiniciar a API não dispara busca)', () => {
    const existing = [{ id: 'schedule:gupy', everyMs: SIX_HOURS, data: spec('gupy').data }];
    expect(planSchedules(existing, [spec('gupy')])).toEqual({ upsert: [], remove: [] });
  });

  it('atualiza quando o intervalo ou os termos mudam', () => {
    const existing = [{ id: 'schedule:gupy', everyMs: SIX_HOURS, data: spec('gupy').data }];

    expect(planSchedules(existing, [spec('gupy', SIX_HOURS * 4)]).upsert).toHaveLength(1);
    expect(planSchedules(existing, [spec('gupy', SIX_HOURS, ['node'])]).upsert).toHaveLength(1);
  });

  it('remove o que não é mais pedido (fonte desligada ou agenda em 0)', () => {
    const existing = [
      { id: 'schedule:gupy', everyMs: SIX_HOURS, data: spec('gupy').data },
      { id: 'schedule:antiga', everyMs: SIX_HOURS, data: {} },
    ];

    expect(planSchedules(existing, [spec('gupy')])).toEqual({
      upsert: [],
      remove: ['schedule:antiga'],
    });
    expect(planSchedules(existing, [])).toEqual({
      upsert: [],
      remove: ['schedule:gupy', 'schedule:antiga'],
    });
  });
});
