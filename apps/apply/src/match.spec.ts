import type { ResumeSectionDto } from '@busca-vagas/shared';
import { describe, expect, it } from 'vitest';
import {
  acceptsPdf,
  answerScore,
  decide,
  pickOption,
  toIsoDate,
  toNumber,
  type FieldInfo,
} from './match.js';
import { buildProfile, classify, splitLocation } from './profile.js';
import { pdfName } from './resume-pdf.js';

/** Currículo de teste (dados inventados). */
const sections = [
  {
    id: 's1',
    title: 'Dados pessoais',
    kind: 'fields',
    position: 0,
    items: [
      { id: 'i1', position: 0, data: { label: 'Nome completo', value: 'Ana Maria Souza' } },
      { id: 'i2', position: 1, data: { label: 'Data de nascimento', value: '15/03/1999' } },
      { id: 'i3', position: 2, data: { label: 'Cidade/UF', value: 'Campinas/SP' } },
    ],
  },
  {
    id: 's2',
    title: 'Contato',
    kind: 'fields',
    position: 1,
    items: [
      { id: 'i4', position: 0, data: { label: 'E-mail', value: 'ana@example.com' } },
      { id: 'i5', position: 1, data: { label: 'Telefone/WhatsApp', value: '(19) 99999-0000' } },
    ],
  },
  {
    id: 's3',
    title: 'Links',
    kind: 'fields',
    position: 2,
    items: [
      { id: 'i6', position: 0, data: { label: 'LinkedIn', value: 'https://linkedin.com/in/ana' } },
      { id: 'i7', position: 1, data: { label: 'GitHub', value: '' } },
    ],
  },
  {
    id: 's4',
    title: 'Resumo profissional',
    kind: 'text',
    position: 3,
    items: [{ id: 'i8', position: 0, data: { text: 'Dev full stack júnior.' } }],
  },
  {
    id: 's5',
    title: 'Idiomas',
    kind: 'fields',
    position: 4,
    items: [{ id: 'i9', position: 0, data: { label: 'Inglês', value: 'Avançado' } }],
  },
  {
    id: 's6',
    title: 'Respostas prontas',
    kind: 'fields',
    position: 5,
    items: [
      { id: 'a1', position: 0, data: { label: 'Pretensão salarial (CLT)', value: 'R$ 4.500' } },
      { id: 'a2', position: 1, data: { label: 'Pretensão salarial (PJ)', value: 'R$ 6.000' } },
      { id: 'a3', position: 2, data: { label: 'Disponibilidade para início', value: 'Imediata' } },
      {
        id: 'a4',
        position: 3,
        data: { label: 'Por que quero trabalhar aqui', value: 'Gosto do produto.' },
      },
    ],
  },
] as unknown as ResumeSectionDto[];

const profile = buildProfile(sections);

const field = (overrides: Partial<FieldInfo>): FieldInfo => ({
  id: 'bv1',
  control: 'text',
  label: '',
  name: '',
  htmlId: '',
  placeholder: '',
  autocomplete: '',
  options: [],
  accept: '',
  maxLength: null,
  ...overrides,
});

describe('currículo → perfil', () => {
  it('dados conhecidos viram chaves; o resto vira resposta por rótulo', () => {
    expect(profile.values).toEqual({
      fullName: 'Ana Maria Souza',
      firstName: 'Ana',
      lastName: 'Maria Souza',
      birthDate: '15/03/1999',
      location: 'Campinas/SP',
      city: 'Campinas',
      state: 'SP',
      email: 'ana@example.com',
      phone: '(19) 99999-0000',
      linkedin: 'https://linkedin.com/in/ana',
      summary: 'Dev full stack júnior.',
    });
    // Campo vazio (GitHub) não entra.
    expect(profile.answers.map((answer) => answer.label)).toEqual([
      'Inglês',
      'Pretensão salarial (CLT)',
      'Pretensão salarial (PJ)',
      'Disponibilidade para início',
      'Por que quero trabalhar aqui',
    ]);
  });

  it.each([
    ['Nome', 'fullName'],
    ['Nome completo*', 'fullName'],
    ['Nome da empresa', null],
    ['Estado civil', null],
    ['UF', 'state'],
    ['Cidade/UF', 'location'],
    ['Cidade', 'city'],
    ['E-mail', 'email'],
    ['Celular (com DDD)', 'phone'],
    ['URL do perfil no LinkedIn', 'linkedin'],
    ['Fale um pouco sobre você', 'summary'],
  ])('%s → %s', (label, key) => {
    expect(classify(label)).toBe(key);
  });

  it('cidade e UF', () => {
    expect(splitLocation('Americana - SP')).toEqual({ city: 'Americana', state: 'SP' });
    expect(splitLocation('São Paulo')).toEqual({ city: 'São Paulo', state: null });
  });
});

describe('campo do formulário → resposta', () => {
  it('dados conhecidos pelo rótulo, pelo autocomplete e pelo tipo', () => {
    expect(decide(field({ label: 'Nome completo' }), profile)).toMatchObject({
      kind: 'value',
      value: 'Ana Maria Souza',
    });
    expect(decide(field({ autocomplete: 'given-name' }), profile)).toMatchObject({ value: 'Ana' });
    expect(decide(field({ name: 'candidate[last_name]' }), profile)).toMatchObject({
      value: 'Maria Souza',
    });
    expect(decide(field({ control: 'email', name: 'x1' }), profile)).toMatchObject({
      value: 'ana@example.com',
    });
    expect(decide(field({ label: 'Cidade' }), profile)).toMatchObject({ value: 'Campinas' });
    expect(decide(field({ control: 'date', label: 'Data de nascimento' }), profile)).toMatchObject({
      value: '1999-03-15',
    });
  });

  it('respostas salvas pela pergunta; CLT/PJ só quando a pergunta diz', () => {
    expect(
      decide(
        field({ control: 'textarea', label: 'Por que você quer trabalhar na empresa?' }),
        profile,
      ),
    ).toMatchObject({ value: 'Gosto do produto.', from: 'Por que quero trabalhar aqui' });
    expect(
      decide(field({ label: 'Qual a sua disponibilidade para início?' }), profile),
    ).toMatchObject({ value: 'Imediata' });
    expect(decide(field({ label: 'Pretensão salarial PJ' }), profile)).toMatchObject({
      value: 'R$ 6.000',
    });
    expect(decide(field({ label: 'Pretensão salarial' }), profile)).toEqual({
      kind: 'skip',
      reason: 'ambiguous',
      detail: 'Pretensão salarial (CLT), Pretensão salarial (PJ)',
    });
    expect(
      decide(field({ control: 'number', label: 'Pretensão salarial (CLT)' }), profile),
    ).toMatchObject({ value: '4500' });
    // "Disponibilidade para viagens" não é "para início".
    expect(decide(field({ label: 'Disponibilidade para viagens?' }), profile)).toMatchObject({
      reason: 'no-answer',
    });
  });

  it('tipo tel/email só decide quando o rótulo não diz outra coisa nem há resposta salva', () => {
    // Sem rótulo: o tipo do campo decide.
    expect(decide(field({ control: 'tel', name: 'f12' }), profile)).toMatchObject({
      value: '(19) 99999-0000',
    });
    // "Pretensão salarial" num type=tel: é a resposta salva (aqui, empate), não o telefone.
    expect(decide(field({ control: 'tel', label: 'Pretensão salarial' }), profile)).toMatchObject({
      reason: 'ambiguous',
    });
    expect(
      decide(field({ control: 'tel', label: 'Pretensão salarial (CLT)' }), profile),
    ).toMatchObject({ value: 'R$ 4.500' });
    // CEP, documento, matrícula: sem resposta salva, fica em branco.
    for (const label of ['CEP', 'Documento', 'Número do documento', 'Matrícula']) {
      expect(decide(field({ control: 'tel', label }), profile)).toEqual({
        kind: 'skip',
        reason: 'no-answer',
      });
    }
    expect(decide(field({ control: 'tel', name: 'cep' }), profile)).toMatchObject({
      reason: 'no-answer',
    });
    // O rótulo ainda manda: "Celular" num campo de texto é o telefone.
    expect(decide(field({ control: 'tel', label: 'Celular' }), profile)).toMatchObject({
      value: '(19) 99999-0000',
    });
    // Resposta salva vence o tipo do campo.
    expect(
      decide(field({ control: 'email', label: 'Disponibilidade para início' }), profile),
    ).toMatchObject({ value: 'Imediata' });
  });

  it('listas e opções: só quando a resposta está entre elas', () => {
    expect(
      decide(
        field({
          control: 'select',
          label: 'Nível de inglês',
          options: ['Selecione', 'Básico', 'Avançado (C1)'],
        }),
        profile,
      ),
    ).toEqual({ kind: 'option', index: 2, from: 'Inglês' });
    expect(
      decide(
        field({ control: 'radio', label: 'Inglês', options: ['Fluente', 'Intermediário'] }),
        profile,
      ),
    ).toEqual({ kind: 'skip', reason: 'no-option', detail: 'Avançado' });
  });

  it('nunca preenche dado sensível; resumo só em caixa grande; tamanho máximo', () => {
    expect(decide(field({ label: 'CPF' }), profile)).toEqual({ kind: 'skip', reason: 'sensitive' });
    expect(decide(field({ label: 'Nome social' }), profile)).toEqual({
      kind: 'skip',
      reason: 'sensitive',
    });
    expect(decide(field({ label: 'Sobre você' }), profile)).toMatchObject({ reason: 'no-answer' });
    expect(decide(field({ control: 'textarea', label: 'Sobre você' }), profile)).toMatchObject({
      value: 'Dev full stack júnior.',
    });
    expect(decide(field({ label: 'Nome', maxLength: 5 }), profile)).toMatchObject({
      reason: 'too-long',
    });
  });

  it('arquivo: documento, comprovante, certificado e imagem nunca recebem o currículo', () => {
    for (const label of [
      'Documento de identificação',
      'Anexe seu RG',
      'Comprovante de residência',
      'Certificado de conclusão',
      'Diploma',
      'Carteira de trabalho',
      'Currículo ou portfólio',
      'Foto 3x4',
    ]) {
      expect(decide(field({ control: 'file', label }), profile, true)).toMatchObject({
        kind: 'skip',
      });
    }
    // Rótulo genérico ("Anexo", "Arquivo", "Documento"): só com a palavra currículo.
    for (const label of ['Anexo', 'Arquivo', 'Documento', 'Upload']) {
      expect(decide(field({ control: 'file', label }), profile, true)).toMatchObject({
        reason: 'no-answer',
      });
    }
    // Só imagem: nem com "currículo" no rótulo.
    expect(
      decide(field({ control: 'file', label: 'Currículo', accept: 'image/*' }), profile),
    ).toMatchObject({ reason: 'format' });
    // Único campo sem rótulo, mas só imagem: não.
    expect(
      decide(field({ control: 'file', name: 'f1', accept: 'image/*' }), profile, true),
    ).toMatchObject({ reason: 'format' });
    // Nome técnico em camelCase também conta.
    expect(decide(field({ control: 'file', htmlId: 'resumeUpload' }), profile)).toEqual({
      kind: 'resume-file',
    });
    expect(decide(field({ control: 'file', name: 'proofOfAddress' }), profile, true)).toMatchObject(
      { reason: 'no-answer' },
    );
    expect(acceptsPdf('')).toBe(true);
    expect(acceptsPdf('.pdf,.doc,.docx')).toBe(true);
    expect(acceptsPdf('application/pdf')).toBe(true);
    expect(acceptsPdf('*/*')).toBe(true);
    expect(acceptsPdf('image/*')).toBe(false);
    expect(acceptsPdf('image/png, image/jpeg')).toBe(false);
    expect(acceptsPdf('.doc,.docx')).toBe(false);
  });

  it('arquivo: currículo pelo rótulo ou por ser o único; foto nunca', () => {
    expect(decide(field({ control: 'file', label: 'Anexe seu currículo' }), profile)).toEqual({
      kind: 'resume-file',
    });
    expect(decide(field({ control: 'file', name: 'upload1' }), profile, true)).toEqual({
      kind: 'resume-file',
    });
    expect(decide(field({ control: 'file', name: 'x' }), profile, false)).toMatchObject({
      reason: 'no-answer',
    });
    expect(decide(field({ control: 'file', label: 'Foto' }), profile, true)).toMatchObject({
      reason: 'photo',
    });
    expect(
      decide(field({ control: 'file', label: 'Currículo', accept: 'image/png' }), profile),
    ).toMatchObject({ reason: 'format' });
  });
});

describe('formatos', () => {
  it('pontuação da resposta salva', () => {
    expect(
      answerScore('Modelo de trabalho preferido', 'Qual modelo de trabalho você prefere?'),
    ).toBe(1);
    expect(answerScore('Pretensão salarial (CLT)', 'Pretensão salarial CLT')).toBe(1.25);
    expect(answerScore('Disponibilidade para início', 'Disponibilidade para viajar')).toBe(0);
  });

  it('opção, data, número e nome do PDF', () => {
    expect(pickOption(['Sim', 'Não'], 'não')).toBe(1);
    expect(pickOption(['Avançado', 'Avançado (C2)'], 'avançado')).toBe(0);
    expect(toIsoDate('5/3/1999')).toBe('1999-03-05');
    expect(toIsoDate('março de 1999')).toBeNull();
    expect(toNumber('R$ 4.500,50')).toBe('4500.5');
    expect(toNumber('4 mil')).toBe('4000');
    expect(toNumber('a combinar')).toBeNull();
    expect(pdfName('João: "Souza"')).toBe('Curriculo - Joao Souza.pdf');
    expect(pdfName(null)).toBe('Curriculo.pdf');
  });
});
