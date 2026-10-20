// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAnswers, collectFields, countFileInputs, showBanner } from './scan.js';

beforeEach(() => {
  document.body.innerHTML = '';
  delete (window as { __bvNext?: number }).__bvNext;
  delete (window as { __bvBannerClosed?: boolean }).__bvBannerClosed;
});

const byLabel = (fields: ReturnType<typeof collectFields>) =>
  Object.fromEntries(fields.map((field) => [field.label, field]));

describe('campos da página', () => {
  it('acha a pergunta em <label>, aria, texto antes do campo e legenda do grupo', () => {
    document.body.innerHTML = `
      <form>
        <label for="n">Nome completo <span>*</span></label><input id="n" name="name">
        <label>E-mail <input type="email" name="email"></label>
        <span id="t">Telefone</span><input type="tel" aria-labelledby="t">
        <div class="question">
          <p>Por que você quer trabalhar aqui?</p>
          <div><textarea name="q1" maxlength="500"></textarea></div>
        </div>
        <select aria-label="Nível de inglês"><option value="">Selecione</option><option>Avançado</option></select>
        <fieldset>
          <legend>Aceita trabalho presencial?</legend>
          <label><input type="radio" name="pres" value="s"> Sim</label>
          <label><input type="radio" name="pres" value="n"> Não</label>
        </fieldset>
        <input type="file" name="cv" style="display:none">
        <input type="password" name="senha">
        <input type="checkbox" name="termos">
        <input name="ja" value="preenchido">
        <input name="escondido" style="display:none">
        <button type="submit">Enviar</button>
      </form>`;

    const fields = byLabel(collectFields([]));
    expect(Object.keys(fields)).toEqual([
      'Nome completo *',
      'E-mail',
      'Telefone',
      'Por que você quer trabalhar aqui?',
      'Nível de inglês',
      '',
      'Aceita trabalho presencial?',
    ]);
    expect(fields['Por que você quer trabalhar aqui?']).toMatchObject({
      control: 'textarea',
      maxLength: 500,
    });
    expect(fields['Nível de inglês']!.options).toEqual(['Selecione', 'Avançado']);
    expect(fields['Aceita trabalho presencial?']).toMatchObject({
      control: 'radio',
      options: ['Sim', 'Não'],
    });
    // O <input type=file> escondido vale (o botão bonito fica por cima).
    expect(fields['']).toMatchObject({ control: 'file', name: 'cv' });

    // Na volta seguinte, só o que apareceu depois.
    document
      .querySelector('form')!
      .insertAdjacentHTML('beforeend', '<label>Cidade <input name="cidade"></label>');
    expect(collectFields([]).map((field) => field.label)).toEqual(['Cidade']);
  });

  it('escreve como digitação, marca a opção e não mexe no que já tem valor', () => {
    document.body.innerHTML = `
      <form id="f">
        <label>Nome <input name="nome"></label>
        <label>Sobre <textarea name="sobre"></textarea></label>
        <select aria-label="Inglês"><option value="">Selecione</option><option value="a">Avançado</option></select>
        <fieldset><legend>Presencial?</legend>
          <label><input type="radio" name="p"> Sim</label><label><input type="radio" name="p"> Não</label>
        </fieldset>
        <button type="submit">Enviar candidatura</button>
      </form>`;
    const submitted = vi.fn((event: Event) => event.preventDefault());
    document.getElementById('f')!.addEventListener('submit', submitted);
    const inputs: string[] = [];
    document.addEventListener('input', (event) =>
      inputs.push((event.target as HTMLElement).tagName),
    );

    const [nome, sobre, ingles, presencial] = collectFields([]);
    // Você digitou no "Sobre" enquanto isso: fica o seu texto.
    document.querySelector('textarea')!.value = 'meu texto';

    const done = applyAnswers({
      answers: [
        { id: nome!.id, value: 'Ana' },
        { id: sobre!.id, value: 'resumo' },
        { id: ingles!.id, index: 1 },
        { id: presencial!.id, index: 1 },
      ],
      restricted: [],
    });

    expect(done).toEqual([nome!.id, ingles!.id, presencial!.id]);
    expect(document.querySelector<HTMLInputElement>('[name="nome"]')!.value).toBe('Ana');
    expect(document.querySelector('textarea')!.value).toBe('meu texto');
    expect(document.querySelector('select')!.value).toBe('a');
    expect(document.querySelectorAll<HTMLInputElement>('[name="p"]')[1]!.checked).toBe(true);
    expect(inputs).toContain('INPUT');
    expect(submitted).not.toHaveBeenCalled();
  });

  it('campo-armadilha: aria-hidden, opacidade 0 e fora da tela ficam de fora', () => {
    document.body.innerHTML = `
      <form>
        <label>Nome <input name="nome"></label>
        <div aria-hidden="true"><label>Site <input name="site"></label></div>
        <label>Empresa <input name="empresa" style="opacity: 0"></label>
        <label>Telefone <input name="fora"></label>
        <label>Cidade <input name="rolou"></label>
        <fieldset>
          <legend>Presencial?</legend>
          <label><input type="radio" name="p" style="opacity: 0"> Sim</label>
          <label><input type="radio" name="p" style="opacity: 0"> Não</label>
        </fieldset>
      </form>`;
    const rect = (left: number, top: number) =>
      ({
        left,
        top,
        right: left + 200,
        bottom: top + 30,
        width: 200,
        height: 30,
        x: left,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;
    // Fora da tela (left: -9999px) e rolado para cima da tela (vale: está na página).
    document.querySelector('[name="fora"]')!.getBoundingClientRect = () => rect(-9999, 10);
    document.querySelector('[name="rolou"]')!.getBoundingClientRect = () => rect(10, -500);
    window.scrollY = 1000;

    // Tamanho zero (jsdom, sem layout) não esconde o campo.
    expect(collectFields([]).map((field) => field.name)).toEqual(['nome', 'rolou', 'p']);
    window.scrollY = 0;
  });

  it('site restrito: não lê, não escreve, não põe aviso', () => {
    document.body.innerHTML = `<label>Nome <input name="nome"></label><input type="file">`;
    // O jsdom roda em "localhost": serve de site restrito no teste.
    expect(collectFields(['localhost'])).toEqual([]);
    expect(document.querySelector('[data-bv-id]')).toBeNull();
    expect(countFileInputs(['localhost'])).toBe(0);
    expect(countFileInputs(['linkedin.com'])).toBe(1);

    const [nome] = collectFields(['linkedin.com']);
    expect(
      applyAnswers({ answers: [{ id: nome!.id, value: 'Ana' }], restricted: ['localhost'] }),
    ).toEqual([]);
    expect(document.querySelector<HTMLInputElement>('[name="nome"]')!.value).toBe('');
    showBanner({ message: 'oi', restricted: ['localhost'] });
    expect(document.getElementById('buscavagas-aviso')).toBeNull();
  });

  it('aviso no canto: atualiza e, fechado, não volta', () => {
    showBanner({ message: 'preencheu 1', restricted: [] });
    showBanner({ message: 'preencheu 2', restricted: [] });
    const banner = document.getElementById('buscavagas-aviso')!;
    expect(banner.textContent).toContain('preencheu 2');
    banner.querySelector('button')!.click();
    showBanner({ message: 'preencheu 3', restricted: [] });
    expect(document.getElementById('buscavagas-aviso')).toBeNull();
  });
});
