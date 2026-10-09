import { describe, expect, it } from 'vitest';
import {
  entryItemSchema,
  fieldItemSchema,
  formatPeriod,
  resumeItemDataSchema,
  resumeItemToText,
  resumeToText,
  type ResumeSectionDto,
} from './resume';

describe('formato dos itens', () => {
  it('campo aceita valor vazio, mas exige rótulo', () => {
    expect(fieldItemSchema.parse({ label: 'E-mail', value: '' })).toEqual({
      label: 'E-mail',
      value: '',
    });
    expect(fieldItemSchema.safeParse({ label: '', value: 'x' }).success).toBe(false);
  });

  it('entrada: atual não tem fim; fim não vem antes do início; datas AAAA-MM', () => {
    const base = { title: 'Dev', current: false };
    expect(entryItemSchema.safeParse({ ...base, current: true, endDate: '2025-01' }).success).toBe(
      false,
    );
    expect(
      entryItemSchema.safeParse({ ...base, startDate: '2025-06', endDate: '2025-01' }).success,
    ).toBe(false);
    expect(entryItemSchema.safeParse({ ...base, startDate: '06/2025' }).success).toBe(false);
    expect(entryItemSchema.parse({ title: 'Dev' }).current).toBe(false);
  });

  it('escolhe o schema pelo tipo da seção', () => {
    expect(resumeItemDataSchema('text').safeParse({ text: 'oi' }).success).toBe(true);
    expect(resumeItemDataSchema('text').safeParse({ label: 'x', value: 'y' }).success).toBe(false);
  });
});

describe('texto para copiar', () => {
  it('período', () => {
    expect(formatPeriod({ startDate: '2026-01', endDate: null, current: true })).toBe(
      '01/2026 – atual',
    );
    expect(formatPeriod({ startDate: '2022-02', endDate: '2025-12', current: false })).toBe(
      '02/2022 – 12/2025',
    );
    expect(formatPeriod({ startDate: null, endDate: null, current: false })).toBe('');
  });

  it('entrada completa', () => {
    expect(
      resumeItemToText('entries', {
        title: 'Desenvolvedor Full Stack Trainee',
        organization: 'Empresa',
        location: 'Americana, SP',
        startDate: '2026-01',
        endDate: null,
        current: true,
        description: 'NestJS e React Native.',
      }),
    ).toBe(
      'Desenvolvedor Full Stack Trainee — Empresa (Americana, SP)\n01/2026 – atual\nNestJS e React Native.',
    );
  });

  it('campo vazio não gera texto', () => {
    expect(resumeItemToText('fields', { label: 'GitHub', value: '' })).toBe('');
  });

  it('currículo inteiro pula seções vazias', () => {
    const sections: ResumeSectionDto[] = [
      {
        id: 's1',
        title: 'Contato',
        kind: 'fields',
        position: 0,
        items: [
          { id: 'i1', position: 0, data: { label: 'E-mail', value: 'eu@email.com' } },
          { id: 'i2', position: 1, data: { label: 'Telefone', value: '' } },
          { id: 'i3', position: 2, data: { label: 'Cidade', value: 'Americana, SP' } },
        ],
      },
      { id: 's2', title: 'Projetos', kind: 'entries', position: 1, items: [] },
      {
        id: 's3',
        title: 'Resumo',
        kind: 'text',
        position: 2,
        items: [{ id: 'i4', position: 0, data: { text: 'Dev full stack.' } }],
      },
    ];

    expect(resumeToText(sections)).toBe(
      'CONTATO\nE-mail: eu@email.com\nCidade: Americana, SP\n\nRESUMO\nDev full stack.\n',
    );
  });
});
