import { describe, expect, it } from 'vitest';
import { seniorityFromTitle } from './seniority';
import { stackFromText } from './stack';
import { fold, htmlToText } from './text';

describe('fold', () => {
  it('tira acento, baixa a caixa e colapsa espaços', () => {
    expect(fold('  Desenvolvedor   JÚNIOR ')).toBe('desenvolvedor junior');
  });
});

describe('htmlToText', () => {
  it('converte blocos, listas, quebras e entidades', () => {
    const html =
      '<p>Vaga para <strong>Dev</strong> &amp; time&nbsp;ágil.</p><ul><li>Node</li><li>React</li></ul>' +
      '<script>alert(1)</script><p>Benef&iacute;cios:<br>VR&#160;e&#x20;VA</p>';

    expect(htmlToText(html)).toBe(
      'Vaga para Dev & time ágil.\n\n• Node\n• React\nBenefícios:\nVR e VA',
    );
  });

  it('corta no tamanho máximo com reticências', () => {
    expect(htmlToText(`<p>${'a'.repeat(50)}</p>`, 10)).toBe('aaaaaaaaa…');
  });
});

describe('seniorityFromTitle', () => {
  it.each([
    ['Estágio em Desenvolvimento de Software', 'intern'],
    ['Estagiário(a) Front-end', 'intern'],
    ['Programa Trainee TI 2027', 'trainee'],
    ['Desenvolvedor Full Stack Júnior', 'junior'],
    ['Dev Backend Jr.', 'junior'],
    ['Desenvolvedor I', 'junior'],
    ['Pessoa Desenvolvedora Pleno', 'mid'],
    ['Analista de Sistemas II', 'mid'],
    ['Engenheiro de Software Sênior', 'senior'],
    ['Dev Sr. Node', 'senior'],
    ['Tech Lead Sênior', 'lead'],
  ] as const)('%s → %s', (title, level) => {
    expect(seniorityFromTitle(title)).toBe(level);
  });

  it('sem pista devolve null em vez de chutar', () => {
    expect(seniorityFromTitle('Desenvolvedor Full Stack')).toBeNull();
    expect(seniorityFromTitle('Analista de TI')).toBeNull();
  });
});

describe('stackFromText', () => {
  it('reconhece tecnologias com variações de escrita', () => {
    expect(
      stackFromText(
        'Desenvolvedor Full Stack (Node.js / React)',
        'Experiência com TypeScript, NestJS, PostgreSQL, Docker e AWS. Desejável React Native e CI/CD.',
      ),
    ).toEqual([
      'typescript',
      'react',
      'react native',
      'node.js',
      'nestjs',
      'postgresql',
      'docker',
      'aws',
      'ci/cd',
    ]);
  });

  it('não confunde java com javascript, nem sql com sql server', () => {
    expect(stackFromText('JavaScript e SQL Server')).toEqual(['javascript', 'sql server']);
    expect(stackFromText('Java 17 e SQL')).toEqual(['java', 'sql']);
  });

  it('c# e .net', () => {
    expect(stackFromText('Dev C# .NET Core')).toEqual(['c#', '.net']);
  });

  it('texto vazio', () => {
    expect(stackFromText(null, undefined, '')).toEqual([]);
  });
});
