import type { PreferencesDto } from '@busca-vagas/shared';
import { describe, expect, it } from 'vitest';
import { inactiveBoard, preferences, source } from '../../test/fixtures';
import { cleanupLines } from './CleanupCard';
import { changedFields, errorsFromApi, moveStack, toForm, validateForm } from './form';
import { shortError } from './ErrorText';
import { runDuration, sourceState } from './SourcesCard';
import { suggestStacks } from './StackCombobox';

const saved = (): PreferencesDto => ({
  ...preferences(),
  stacksCore: ['node.js'],
  maxAgeDays: 30,
});

describe('formulário das preferências', () => {
  it('números: vazio desliga, fora da faixa ou quebrado é erro', () => {
    const form = toForm(saved());
    expect(
      validateForm({ ...form, maxAgeDays: '', minMonthlySalary: ' 3000 ' }).values,
    ).toMatchObject({ maxAgeDays: null, minMonthlySalary: 3000 });
    expect(validateForm({ ...form, maxAgeDays: '0' }).errors).toEqual({
      maxAgeDays: 'Use de 1 a 365 dias, ou deixe vazio para desligar.',
    });
    expect(validateForm({ ...form, minMonthlySalary: '2500.5' }).errors).toEqual({
      minMonthlySalary: 'Use de R$ 0 a R$ 1.000.000, ou deixe vazio para desligar.',
    });
  });

  it('mesma tecnologia em "Evitar" e noutro grupo é erro (a tela evita, o schema garante)', () => {
    const form = { ...toForm(saved()), stacksAvoid: ['node.js'] };
    expect(validateForm(form).errors).toEqual({
      stacksAvoid: 'A mesma tecnologia não pode estar em "Evitar" e em outro grupo.',
    });
  });

  it('mover tecnologia tira dos outros grupos e diz de onde saiu', () => {
    const form = { ...toForm(saved()), stacksPlus: ['docker'] };
    const moved = moveStack(form, 'node.js', 'stacksAvoid');
    expect(moved.from).toBe('stacksCore');
    expect(moved.form).toMatchObject({
      stacksCore: [],
      stacksPlus: ['docker'],
      stacksAvoid: ['node.js'],
    });
    expect(moveStack(form, 'react', 'stacksPlus')).toMatchObject({
      from: null,
      form: { stacksPlus: ['docker', 'react'] },
    });
  });

  it('conta só os campos que mudaram (espaço no número não conta)', () => {
    const prefs = saved();
    const form = toForm(prefs);
    expect(changedFields(form, prefs)).toEqual([]);
    expect(changedFields({ ...form, maxAgeDays: ' 30 ' }, prefs)).toEqual([]);
    expect(
      changedFields({ ...form, cities: ['Campinas'], minMonthlySalary: '3000' }, prefs),
    ).toEqual(['cities', 'minMonthlySalary']);
  });

  it('erros que a API devolve caem no campo certo', () => {
    expect(
      errorsFromApi([
        { path: 'maxAgeDays', message: 'Too big' },
        { path: 'cities.3', message: 'Muito longo' },
        { path: 'outro', message: 'x' },
      ]),
    ).toEqual({
      maxAgeDays: 'Use de 1 a 365 dias, ou deixe vazio para desligar.',
      cities: 'Muito longo',
    });
  });
});

describe('cartões ao lado', () => {
  it('estado da fonte: última busca, próxima, desligada, rodando', () => {
    const now = new Date();
    expect(sourceState(source(), now)).toMatch(
      /^Há 2 h · 387 vagas \(23 novas\) · próxima em (4 h|3 h 59 min)$/,
    );
    expect(sourceState(inactiveBoard(), now)).toBe('Parada · nenhuma empresa na lista');
    expect(
      sourceState(source({ kind: 'company-board', active: false, reason: 'inválida' }), now),
    ).toBe('Desligada');
    expect(sourceState(source({ running: true }), now)).toBe('Buscando agora…');
    expect(sourceState(source({ lastRun: null, nextRunAt: null }), now)).toBe('Ainda não buscou');
  });

  it('duração da busca em segundos quando é curta', () => {
    expect(runDuration(1_524)).toBe('1,5 s');
    expect(runDuration(125_000)).toBe('2 min');
    expect(runDuration(null)).toBeNull();
  });

  it('limpeza: uma linha por tipo, só o que tem', () => {
    expect(
      cleanupLines({
        enabled: true,
        days: 30,
        cutoff: null,
        dismissed: 1,
        stale: 0,
        sourceRuns: 2,
        forgottenExpired: 3,
        dryRun: true,
      }),
    ).toEqual([
      '1 vaga descartada há mais de 30 dias — não volta nas próximas buscas',
      '2 registros do histórico de buscas com mais de 30 dias',
      '3 bloqueios de vaga descartada há muito tempo — elas podem voltar a aparecer nas buscas',
    ]);
  });
});

describe('sugestões e erros', () => {
  const options = [
    { name: 'react', known: true, jobs: 13 },
    { name: 'react native', known: true, jobs: 4 },
    { name: 'preact', known: false, jobs: 20 },
    { name: 'node.js', known: true, jobs: 9 },
  ];

  it('quem começa com o texto vem antes; o que já está no grupo sai', () => {
    expect(suggestStacks(options, 'REact', []).map((o) => o.name)).toEqual([
      'react',
      'react native',
      'preact',
    ]);
    expect(suggestStacks(options, '', ['react']).map((o) => o.name)).toEqual([
      'react native',
      'preact',
      'node.js',
    ]);
  });

  it('erro comprido vira a primeira linha, cortada', () => {
    const long = `Falha ao gravar as vagas: ${'x'.repeat(200)}\nlinha 2`;
    const short = shortError(long);
    expect(short.length).toBe(140);
    expect(short.endsWith('…')).toBe(true);
    expect(shortError('Falha de rede: fetch failed')).toBe('Falha de rede: fetch failed');
  });
});
