import { describe, expect, it } from 'vitest';
import { applicationsCsv, csvField, type CsvApplication } from './applications-csv';

describe('csvField', () => {
  it('aspas só quando precisa', () => {
    expect(csvField(null)).toBe('');
    expect(csvField('Dev Júnior')).toBe('Dev Júnior');
    expect(csvField('a; b')).toBe('"a; b"');
    expect(csvField('diz "oi"')).toBe('"diz ""oi"""');
  });

  it.each([
    ['=HYPERLINK("http://evil","x")', `"'=HYPERLINK(""http://evil"",""x"")"`],
    ['+1+2', "'+1+2"],
    ['-2+3', "'-2+3"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\tcmd', "'\tcmd"],
    ['\rcmd', `"'\rcmd"`],
  ])('texto que parece fórmula vira texto: %j', (value, expected) => {
    expect(csvField(value)).toBe(expected);
  });

  it('fórmula no meio do texto e números ficam como estão', () => {
    expect(csvField('Dev = Full Stack')).toBe('Dev = Full Stack');
    expect(csvField(-5000)).toBe('-5000');
    expect(csvField(5000)).toBe('5000');
  });
});

describe('applicationsCsv', () => {
  it('título e anotações vindos de fora não viram fórmula', () => {
    const row: CsvApplication = {
      status: 'applied',
      appliedAt: new Date('2026-10-01T12:00:00Z'),
      updatedAt: new Date('2026-10-01T12:00:00Z'),
      appliedVia: null,
      salaryExpectation: null,
      notes: '@ligar',
      nextStepAt: null,
      nextStepNote: null,
      job: { title: '=1+1', company: 'Acme', source: 'gupy', url: null },
    };
    const [, line] = applicationsCsv([row], 'America/Sao_Paulo').slice(1).trim().split('\r\n');
    expect(line?.split(';')[0]).toBe("'=1+1");
    expect(line?.split(';')[10]).toBe("'@ligar");
  });
});
