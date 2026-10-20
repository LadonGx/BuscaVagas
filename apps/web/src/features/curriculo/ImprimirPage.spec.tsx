import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockApi } from '../../test/api-mock';
import { resume } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import {
  buildDocument,
  FONT_SIZES_PT,
  fitToOnePage,
  isProjectSection,
  PRINT_HEIGHT_MM,
  splitDescription,
} from './ImprimirPage';
import { PDF_CHOICES_KEY, fieldShownByDefault, sectionShownByDefault } from './pdfChoices';

describe('uma página só', () => {
  const pagePx = (PRINT_HEIGHT_MM * 96) / 25.4;
  /** Conteúdo cuja altura cai junto com a letra (como no navegador). */
  function sheet(heightAt105pt: number) {
    const paper = document.createElement('article');
    const content = document.createElement('div');
    paper.append(content);
    content.getBoundingClientRect = () =>
      ({ height: (heightAt105pt * parseFloat(paper.style.fontSize)) / 10.5 }) as DOMRect;
    return { paper, content };
  }

  it('cabe: fica na letra maior', () => {
    const { paper, content } = sheet(pagePx * 0.8);
    expect(fitToOnePage(paper, content)).toEqual({ size: 10.5, pages: 1 });
    expect(paper.style.fontSize).toBe('10.5pt');
  });

  it('passa um pouco: diminui a letra até caber', () => {
    const { paper, content } = sheet(pagePx * 1.08);
    expect(fitToOnePage(paper, content)).toEqual({ size: 9.5, pages: 1 });
  });

  it('não cabe nem no mínimo: avisa quantas páginas', () => {
    const { paper, content } = sheet(pagePx * 1.6);
    expect(fitToOnePage(paper, content)).toEqual({ size: FONT_SIZES_PT.at(-1), pages: 2 });
  });

  it('seção de projetos: nome em negrito e contexto entre parênteses', () => {
    expect(isProjectSection('Projetos')).toBe(true);
    expect(isProjectSection('Projetos em destaque')).toBe(true);
    expect(isProjectSection('Experiência')).toBe(false);
  });

  it('descrição: linhas com "-" ou "•" viram lista; o resto, parágrafo', () => {
    expect(
      splitDescription('Time de produto.\n- Criei a API\n• Testes com Vitest\n\nOutro parágrafo'),
    ).toEqual([
      { bullets: [], paragraphs: ['Time de produto.'] },
      { bullets: ['Criei a API', 'Testes com Vitest'], paragraphs: [] },
      { bullets: [], paragraphs: ['Outro parágrafo'] },
    ]);
  });
});

describe('o que entra no PDF', () => {
  it('por padrão, sem Respostas prontas, data de nascimento e pretensão salarial', () => {
    expect(sectionShownByDefault('Respostas prontas')).toBe(false);
    expect(sectionShownByDefault('Experiência')).toBe(true);
    expect(fieldShownByDefault('Data de nascimento')).toBe(false);
    expect(fieldShownByDefault('Pretensão salarial (PJ)')).toBe(false);
    expect(fieldShownByDefault('PRETENSAO SALARIAL')).toBe(false);
    expect(fieldShownByDefault('E-mail')).toBe(true);
  });

  it('nome no topo, campos do começo na linha de contato, vazio fora', () => {
    const doc = buildDocument(resume().sections, {});

    expect(doc.name).toBe('Ana Souza');
    // Data de nascimento escondida; telefone vazio.
    expect(doc.contact).toEqual(['Americana/SP', 'ana@email.com']);
    expect(doc.blocks.map((block) => block.title)).toEqual([
      'Resumo profissional',
      'Experiência',
      'Competências',
    ]);
  });

  it('a escolha da pessoa vale mais que o padrão', () => {
    const doc = buildDocument(resume().sections, { 's-resp': true, 'i-email': false });

    expect(doc.contact).toEqual(['Americana/SP']);
    const answers = doc.blocks.find((block) => block.id === 's-resp');
    // A seção entrou, mas a pretensão continua fora.
    expect(answers).toMatchObject({
      kind: 'fields',
      fields: [{ label: 'Disponibilidade para início', value: 'Imediata' }],
    });
  });
});

describe('Imprimir currículo', () => {
  function open() {
    mockApi({ 'GET /resume': () => resume() });
    const user = userEvent.setup();
    const app = renderApp('/curriculo/imprimir');
    return { user, ...app };
  }

  it('mostra a folha sem o menu do app e com o título do arquivo', async () => {
    open();

    const paper = await screen.findByRole('article', { name: 'Prévia do currículo' });
    expect(within(paper).getByRole('heading', { level: 1 })).toHaveTextContent('Ana Souza');
    expect(paper).toHaveTextContent('Americana/SP · ana@email.com');
    // Empresa em negrito com local e período na mesma linha; o cargo embaixo.
    expect(paper).toHaveTextContent('LumenRemoto · 01/2025 – atualDesenvolvedora Jr');
    expect(paper).not.toHaveTextContent('01/02/2000');
    expect(paper).not.toHaveTextContent('R$ 4.000');
    expect(paper).not.toHaveTextContent('Respostas prontas');
    expect(screen.queryByRole('navigation', { name: 'Principal' })).not.toBeInTheDocument();
    expect(document.title).toBe('Currículo — Ana Souza');
  });

  it('marcar e desmarcar muda a folha e fica salvo no navegador', async () => {
    const { user } = open();
    const paper = await screen.findByRole('article', { name: 'Prévia do currículo' });

    expect(screen.getByRole('checkbox', { name: 'Pretensão salarial (CLT)' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Respostas prontas' }));
    expect(paper).toHaveTextContent('Disponibilidade para início: Imediata');
    expect(paper).not.toHaveTextContent('R$ 4.000');

    await user.click(screen.getByRole('checkbox', { name: 'Competências' }));
    expect(paper).not.toHaveTextContent('TypeScript, Java');

    expect(JSON.parse(localStorage.getItem(PDF_CHOICES_KEY)!)).toEqual({
      's-resp': true,
      's-comp': false,
    });
  });

  it('"Salvar como PDF" abre a impressão do navegador', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const { user } = open();

    await screen.findByRole('article', { name: 'Prévia do currículo' });
    await user.click(screen.getByRole('button', { name: 'Salvar como PDF' }));
    expect(print).toHaveBeenCalledOnce();
    print.mockRestore();
  });

  it('"Voltar ao currículo" volta para o formulário', async () => {
    const { user, router } = open();

    await user.click(await screen.findByRole('link', { name: 'Voltar ao currículo' }));
    expect(router.state.location.pathname).toBe('/curriculo');
  });
});
