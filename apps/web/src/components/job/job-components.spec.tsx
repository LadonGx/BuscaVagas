import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { job } from '../../test/fixtures';
import { jobChipTexts, JobChips, StackChips, StatusChip } from './Chips';
import { ReasonLine, ReasonList } from './ReasonList';
import { ScoreBadge } from './ScoreBadge';

describe('ScoreBadge', () => {
  it('nota com a frase completa e a faixa como tom', () => {
    render(<ScoreBadge job={job({ score: 912, scoreCoverage: 45 })} />);
    const badge = screen.getByRole('img', { name: 'Nota 912 de 1000, sobre 45% dos critérios' });
    expect(badge).toHaveTextContent('912');
    expect(badge).toHaveAttribute('data-tone', 'great');
  });

  it.each([
    [{ score: 700 }, 'good', '700'],
    [{ score: 400 }, 'weak', '400'],
    [{ score: 0, incompatible: true }, 'bad', '0'],
    [{ scorePending: true }, 'pending', '…'],
    [{ score: null }, 'none', '—'],
  ] as const)('%o → tom %s', (overrides, tone, text) => {
    render(<ScoreBadge job={job(overrides)} />);
    const badge = screen.getByRole('img');
    expect(badge).toHaveAttribute('data-tone', tone);
    expect(badge).toHaveTextContent(text);
  });
});

describe('motivos', () => {
  const reasons = [
    { criterion: 'stack', kind: 'plus', text: 'Node.js' },
    { criterion: 'seniority', kind: 'minus', text: 'Pleno' },
    { criterion: 'salary', kind: 'unknown', text: 'Salário não informado' },
    { criterion: 'company', kind: 'block', text: 'Empresa bloqueada' },
  ] as const;

  it('lista com sinal visível e significado para leitor de tela', () => {
    render(<ReasonList reasons={reasons} />);
    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      '+A favor: Node.js',
      '−Contra: Pleno',
      '?Sem informação: Salário não informado',
      '×Incompatível: Empresa bloqueada',
    ]);
  });

  it('linha do cartão e lista vazia', () => {
    const { container } = render(<ReasonLine reasons={reasons.slice(0, 2)} />);
    expect(container).toHaveTextContent('+A favor: Node.js−Contra: Pleno');
    const empty = render(<ReasonList reasons={[]} />);
    expect(empty.container).toBeEmptyDOMElement();
  });
});

describe('chips', () => {
  it('modalidade, local, contrato, nível e salário, sem buracos', () => {
    expect(
      jobChipTexts(
        job({
          contractType: null,
          salaryMin: 4000,
          salaryMax: 6000,
          salaryCurrency: 'BRL',
          salaryPeriod: 'month',
        }),
      ).map((text) => text.replace(/\s/g, ' ')),
    ).toEqual(['Híbrida', 'Campinas, SP', 'Júnior', 'R$ 4.000 – R$ 6.000/mês']);
  });

  it('estágio como contrato e como nível aparece uma vez só', () => {
    expect(
      jobChipTexts(job({ contractType: 'internship', seniority: 'intern', location: null })),
    ).toEqual(['Híbrida', 'Estágio']);
  });

  it('JobChips vira lista', () => {
    render(<JobChips job={job()} />);
    expect(
      within(screen.getByRole('list', { name: 'Detalhes da vaga' })).getAllByRole('listitem'),
    ).toHaveLength(4);
  });

  it('stack acima do limite vira +N com o resto', () => {
    render(<StackChips stack={['a', 'b', 'c', 'd', 'e', 'f']} max={4} />);
    const more = screen.getByText('+2');
    expect(more).toHaveAttribute('title', 'e, f');
    expect(screen.getByRole('list', { name: 'Stack' })).toHaveTextContent('abcd+2: e, f');
  });

  it('status: candidatura manda sobre a triagem', () => {
    const { rerender } = render(<StatusChip job={job({ triage: 'saved' })} />);
    expect(screen.getByText('Salva')).toBeVisible();
    rerender(
      <StatusChip job={job({ triage: 'saved', application: { id: 'a', status: 'in_process' } })} />,
    );
    expect(screen.getByText('Em processo')).toBeVisible();
  });
});
