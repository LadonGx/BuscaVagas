import { describe, expect, it } from 'vitest';
import { saveMessage } from './CurriculoPage';
import { normalizeItem, sameItem, validateItem } from './draft';
import { singularOf } from './EntriesSection';
import { swapped } from './ItemTools';

describe('rascunho do currículo', () => {
  it('compara sem acusar espaço no fim nem undefined × null', () => {
    expect(
      sameItem(
        'fields',
        { label: 'E-mail', value: 'a@b.com' },
        { label: 'E-mail ', value: ' a@b.com' },
      ),
    ).toBe(true);
    expect(
      sameItem(
        'entries',
        { title: 'Dev', current: false },
        { title: 'Dev', organization: '', location: null, current: false, description: '  ' },
      ),
    ).toBe(true);
    expect(sameItem('text', { text: 'a' }, { text: 'b' })).toBe(false);
  });

  it('normaliza a entrada como a API guardaria', () => {
    expect(
      normalizeItem('entries', {
        title: ' Dev ',
        organization: '',
        startDate: '2025-01',
        current: true,
      }),
    ).toEqual({
      title: 'Dev',
      organization: null,
      location: null,
      startDate: '2025-01',
      endDate: null,
      current: true,
      description: null,
    });
  });

  it('valida com o schema do shared e responde em português', () => {
    expect(validateItem('entries', { title: '', current: false })).toEqual({
      title: 'Preencha este campo.',
    });
    expect(
      validateItem('entries', {
        title: 'Dev',
        startDate: '2025-05',
        endDate: '2025-01',
        current: false,
      }),
    ).toEqual({ endDate: 'A data de fim é anterior à de início' });
    expect(validateItem('fields', { label: 'X', value: 'a'.repeat(5_001) })).toEqual({
      value: 'Use no máximo 5.000 caracteres.',
    });
    expect(validateItem('text', { text: '' })).toEqual({});
  });

  it('mensagem do "Salvar" junta erro e falha, e diz o que foi salvo', () => {
    expect(saveMessage({ saved: 2, invalid: 0, failed: [] })).toEqual({
      tone: 'success',
      message: 'Currículo salvo.',
    });
    expect(
      saveMessage({
        saved: 3,
        invalid: 2,
        failed: [{ id: 'a', error: new Error('API fora do ar.') }],
      }),
    ).toEqual({
      tone: 'error',
      message:
        '2 itens têm erro — corrija os campos marcados; 1 item não foi salvo (API fora do ar.). Os outros 3 foram salvos.',
    });
  });

  it('nome do botão de adicionar e troca de posição', () => {
    expect(singularOf('Experiência')).toBe('experiência');
    expect(singularOf('Cursos e certificações')).toBe('curso');
    expect(singularOf('Voluntariado')).toBe('item');
    expect(swapped(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(swapped(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });
});
