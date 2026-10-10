import { EMPTY_PREFERENCES, type PreferencesValues } from '@busca-vagas/shared';
import { describe, expect, it } from 'vitest';
import { scoreJob, type ScorableJob } from './score';

const NOW = new Date('2026-10-10T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

const baseJob: ScorableJob = {
  title: 'Desenvolvedor Full Stack Júnior',
  company: 'Acme',
  location: 'Campinas, SP',
  workModel: 'hybrid',
  contractType: 'clt',
  seniority: 'junior',
  stack: ['typescript', 'react', 'node.js', 'postgresql', 'docker'],
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
  salaryPeriod: null,
  postedAt: daysAgo(2),
  firstSeenAt: daysAgo(1),
};

const prefs = (values: Partial<PreferencesValues>): PreferencesValues => ({
  ...EMPTY_PREFERENCES,
  ...values,
});

const job = (values: Partial<ScorableJob>): ScorableJob => ({ ...baseJob, ...values });

const MINE = prefs({
  stacksCore: ['node.js', 'nestjs', 'react', 'typescript'],
  stacksPlus: ['docker', 'postgresql'],
  stacksAvoid: ['php'],
  seniorities: ['trainee', 'junior'],
  workModels: ['remote', 'hybrid'],
  cities: ['Americana', 'Campinas', 'Sumaré'],
  contractTypes: ['clt', 'pj'],
  maxAgeDays: 30,
});

describe('scoreJob — geral', () => {
  it('sem preferências: sem nota', () => {
    expect(scoreJob(baseJob, EMPTY_PREFERENCES, NOW)).toEqual({
      score: null,
      coverage: null,
      reasons: [],
      incompatible: false,
    });
  });

  it('vaga perfeita para o perfil: 1000, cobertura total, motivos na ordem', () => {
    const result = scoreJob(baseJob, MINE, NOW);
    expect(result).toMatchObject({ score: 1000, coverage: 100, incompatible: false });
    expect(result.reasons).toEqual([
      {
        criterion: 'stack',
        kind: 'plus',
        text: 'Node.js, react, typescript (3 de 4 principais) · + docker, postgresql',
      },
      { criterion: 'seniority', kind: 'plus', text: 'Júnior' },
      { criterion: 'workModel', kind: 'plus', text: 'Híbrida em Campinas, SP' },
      { criterion: 'contract', kind: 'plus', text: 'CLT' },
      { criterion: 'recency', kind: 'plus', text: 'Publicada há 2 dias' },
    ]);
  });

  it('critério sem sinal sai da conta em vez de zerar', () => {
    const noContract = scoreJob(job({ contractType: null }), MINE, NOW);
    // Peso ligado: 35+25+20+10+10 = 100; sem contrato: 90 de 100.
    expect(noContract).toMatchObject({ score: 1000, coverage: 90 });
    expect(noContract.reasons).toContainEqual({
      criterion: 'contract',
      kind: 'unknown',
      text: 'Contrato não informado',
    });
  });

  it('nenhum critério com sinal: sem nota, cobertura 0', () => {
    const result = scoreJob(
      job({ seniority: null, stack: [] }),
      prefs({ seniorities: ['junior'], stacksCore: ['react'] }),
      NOW,
    );
    expect(result).toMatchObject({ score: null, coverage: 0, incompatible: false });
  });
});

describe('stack', () => {
  const only = prefs({ stacksCore: ['node.js', 'react', 'nestjs'], stacksPlus: ['docker'] });

  it.each([
    [['node.js', 'react', 'nestjs', 'docker'], 1000],
    [['node.js', 'react', 'nestjs'], 800],
    [['node.js', 'docker'], 467], // 0.8 × 1/3 + 0.2
    [['java'], 0],
  ])('%j → %i', (stack, expected) => {
    expect(scoreJob(job({ stack }), only, NOW).score).toBe(expected);
  });

  it('até 3 principais já dão a nota cheia, mesmo com uma lista maior', () => {
    const many = prefs({ stacksCore: ['a', 'b', 'c', 'd', 'e'] });
    expect(scoreJob(job({ stack: ['a', 'b', 'c'] }), many, NOW).score).toBe(1000);
  });

  it('stack evitada na descrição corta pela metade', () => {
    const result = scoreJob(
      job({ stack: ['node.js', 'react', 'nestjs', 'docker', 'php'] }),
      prefs({ ...only, stacksAvoid: ['php'] }),
      NOW,
    );
    expect(result.score).toBe(500);
    expect(result.reasons[0]?.text).toContain('cita stack evitada: php');
  });

  it('stack evitada no título: incompatível, nota 0', () => {
    const result = scoreJob(
      job({ title: 'Desenvolvedor PHP Pleno', stack: ['php', 'react'] }),
      MINE,
      NOW,
    );
    expect(result).toMatchObject({ score: 0, incompatible: true });
    expect(result.reasons[0]).toEqual({
      criterion: 'stack',
      kind: 'block',
      text: 'Stack evitada no título: php',
    });
  });

  it('vaga sem stack detectada: sem sinal', () => {
    expect(scoreJob(job({ stack: [] }), only, NOW)).toMatchObject({ score: null, coverage: 0 });
  });
});

describe('senioridade', () => {
  const wants = prefs({ seniorities: ['junior'] });

  it.each([
    ['junior', 1000],
    ['trainee', 500],
    ['mid', 500],
    ['senior', 0],
    ['intern', 0],
  ] as const)('%s → %i', (seniority, expected) => {
    expect(scoreJob(job({ seniority }), wants, NOW).score).toBe(expected);
  });

  it('motivo diz o que você busca', () => {
    expect(scoreJob(job({ seniority: 'senior' }), MINE, NOW).reasons).toContainEqual({
      criterion: 'seniority',
      kind: 'minus',
      text: 'Sênior (você busca trainee, júnior)',
    });
  });
});

describe('modalidade e local', () => {
  it('remota aceita: nota cheia, cidade não importa', () => {
    expect(scoreJob(job({ workModel: 'remote', location: 'Recife' }), MINE, NOW).incompatible).toBe(
      false,
    );
  });

  it('cidade casa sem acento e por trecho', () => {
    const result = scoreJob(job({ location: 'Sumare - SP' }), MINE, NOW);
    expect(result.incompatible).toBe(false);
    expect(result.score).toBe(1000);
  });

  it('híbrida em outra cidade: incompatível', () => {
    const result = scoreJob(job({ location: 'Recife, PE' }), MINE, NOW);
    expect(result).toMatchObject({ score: 0, incompatible: true });
    expect(result.reasons[0]?.text).toBe('Híbrida em Recife, PE (fora das suas cidades)');
  });

  it('modalidade não aceita: incompatível', () => {
    const result = scoreJob(job({ workModel: 'onsite' }), MINE, NOW);
    expect(result.incompatible).toBe(true);
    expect(result.reasons[0]?.text).toBe('Presencial (você aceita: remota, híbrida)');
  });

  it('híbrida sem cidade informada: meio ponto', () => {
    const result = scoreJob(
      job({ location: null }),
      prefs({ workModels: ['hybrid'], cities: ['Campinas'] }),
      NOW,
    );
    expect(result.score).toBe(500);
  });

  it('sem cidades configuradas, qualquer local serve', () => {
    expect(
      scoreJob(job({ location: 'Recife' }), prefs({ workModels: ['hybrid'] }), NOW).score,
    ).toBe(1000);
  });
});

describe('contrato, idade e salário', () => {
  it('contrato fora da lista pesa contra, sem bloquear', () => {
    const result = scoreJob(
      job({ contractType: 'internship' }),
      prefs({ contractTypes: ['clt'] }),
      NOW,
    );
    expect(result).toMatchObject({ score: 0, incompatible: false });
  });

  it.each([
    [0, 1000],
    [7, 1000],
    [18, 522], // 1 − 11/23
    [30, 0],
    [90, 0],
  ])('publicada há %i dias (máx. 30) → %i', (days, expected) => {
    const result = scoreJob(job({ postedAt: daysAgo(days) }), prefs({ maxAgeDays: 30 }), NOW);
    expect(result.score).toBe(expected);
  });

  it('sem data de publicação, usa a entrada no app e avisa', () => {
    const result = scoreJob(
      job({ postedAt: null, firstSeenAt: daysAgo(3) }),
      prefs({ maxAgeDays: 30 }),
      NOW,
    );
    expect(result.reasons[0]?.text).toBe('Publicada há 3 dias (entrada no app)');
  });

  it.each([
    [{ salaryMax: 5000, salaryPeriod: 'month' }, 1000],
    [{ salaryMin: 2000, salaryPeriod: 'month' }, 500],
    [{ salaryMax: 60000, salaryPeriod: 'year' }, 1000],
    [{ salaryMax: 20, salaryPeriod: 'hour' }, 880], // 20 × 176 = 3520
  ] as const)('salário %j (mínimo 4000) → %i', (salary, expected) => {
    const result = scoreJob(
      job({ ...salary, salaryCurrency: 'BRL' }),
      prefs({ minMonthlySalary: 4000 }),
      NOW,
    );
    expect(result.score).toBe(expected);
  });

  it('salário em outra moeda não é comparado', () => {
    const result = scoreJob(
      job({ salaryMax: 5000, salaryCurrency: 'USD', salaryPeriod: 'month' }),
      prefs({ minMonthlySalary: 4000 }),
      NOW,
    );
    expect(result).toMatchObject({ score: null, coverage: 0 });
    expect(result.reasons[0]?.text).toBe('Salário em USD — sem comparação');
  });

  it('salário abaixo do mínimo explica', () => {
    const result = scoreJob(
      job({ salaryMax: 3000, salaryCurrency: 'BRL', salaryPeriod: 'month' }),
      prefs({ minMonthlySalary: 4000 }),
      NOW,
    );
    expect(result.reasons[0]?.text).toBe('Até R$ 3.000/mês (seu mínimo: R$ 4.000)');
  });
});

describe('empresa bloqueada', () => {
  it('casa por trecho e sem acento; nota 0 com motivo no topo', () => {
    const result = scoreJob(
      job({ company: 'Consultoria Exemplo Ltda' }),
      prefs({ ...MINE, blockedCompanies: ['consultoria exemplo'] }),
      NOW,
    );
    expect(result).toMatchObject({ score: 0, incompatible: true });
    expect(result.reasons[0]).toEqual({
      criterion: 'company',
      kind: 'block',
      text: 'Empresa bloqueada: Consultoria Exemplo Ltda',
    });
  });
});
