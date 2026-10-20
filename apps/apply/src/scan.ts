import type { FieldInfo } from './match.js';

/*
 * Funções que rodam DENTRO da página (Playwright `frame.evaluate`): precisam
 * ser autocontidas, sem imports nem nada de fora (só tipos). Leem os campos e
 * escrevem valores; nunca clicam em botão, nunca enviam formulário.
 *
 * `restricted`: os sites restritos (RESTRICTED_SITES). O filler confere o
 * endereço antes, mas o quadro pode ter navegado nesse meio-tempo: cada função
 * confere de novo, na página, e não faz nada num desses sites.
 */

/** Uma resposta para aplicar: texto (`value`) ou opção (`index`). */
export interface Apply {
  id: string;
  value?: string;
  index?: number;
}

/**
 * Os campos novos da página (os que ainda não têm `data-bv-id`). Campo que
 * já tem valor (o site preencheu, ou você) é marcado e fica de fora: nada é
 * sobrescrito.
 */
export function collectFields(restricted: readonly string[]): FieldInfo[] {
  const host = location.hostname.toLowerCase().replace(/\.+$/, '');
  if (restricted.some((site) => host === site || host.endsWith(`.${site}`))) return [];

  const ATTR = 'data-bv-id';
  const CONTROLS = 'input, select, textarea, button';
  const state = window as unknown as { __bvNext?: number };
  const nextId = () => {
    state.__bvNext = (state.__bvNext ?? 0) + 1;
    return `bv${state.__bvNext}`;
  };
  const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

  /**
   * Escondido de quem usa a página: `hidden`, `display: none`, `aria-hidden`,
   * opacidade 0 ou fora da tela (o campo-armadilha para robôs costuma ficar
   * assim). `own = false` (radio): o próprio campo pode estar transparente ou
   * fora da tela, porque o site desenha a bolinha por cima; vale o que está em
   * volta. Tamanho zero não conta: sem layout (jsdom) não dá para saber.
   */
  const isHidden = (element: Element, own = true) => {
    for (let node: Element | null = element; node; node = node.parentElement) {
      if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true') return true;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return true;
      if ((own || node !== element) && parseFloat(style.opacity) === 0) return true;
    }
    if (!own) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    // Em coordenadas da página: campo que só rolou para cima da tela vale.
    return rect.right + window.scrollX < 0 || rect.bottom + window.scrollY < 0;
  };

  /** Texto do elemento sem o texto dos campos e opções dentro dele. */
  const ownText = (element: Element) => {
    const copy = element.cloneNode(true) as Element;
    copy
      .querySelectorAll('input, select, textarea, option, button, script, style')
      .forEach((node) => node.remove());
    return clean(copy.textContent);
  };

  /** O texto logo antes do campo (a pergunta num "cartão"), até 4 níveis acima. */
  const precedingText = (start: Element) => {
    let node: Element = start;
    for (let level = 0; level < 4 && node.parentElement; level++) {
      for (
        let sibling = node.previousElementSibling;
        sibling;
        sibling = sibling.previousElementSibling
      ) {
        if (sibling.querySelector(CONTROLS) || sibling.matches(CONTROLS)) return '';
        const text = ownText(sibling);
        if (text) return text.length <= 300 ? text : '';
      }
      node = node.parentElement;
    }
    return '';
  };

  const byIds = (ids: string | null) =>
    clean(
      (ids ?? '')
        .split(/\s+/)
        .map((id) => (id ? document.getElementById(id) : null))
        .map((element) => (element ? ownText(element) : ''))
        .join(' '),
    );

  const labelOf = (element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => {
    const fromLabels = clean(
      Array.from(element.labels ?? [])
        .map((label) => ownText(label))
        .join(' '),
    );
    return (
      fromLabels ||
      byIds(element.getAttribute('aria-labelledby')) ||
      clean(element.getAttribute('aria-label')) ||
      clean(element.getAttribute('title')) ||
      precedingText(element)
    );
  };

  const base = (element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => {
    const id = nextId();
    element.setAttribute(ATTR, id);
    return {
      id,
      label: labelOf(element),
      name: element.getAttribute('name') ?? '',
      htmlId: element.id,
      placeholder: clean(element.getAttribute('placeholder')),
      autocomplete: element.getAttribute('autocomplete') ?? '',
      options: [] as string[],
      accept: '',
      maxLength: null as number | null,
    };
  };

  const TEXT_TYPES: Record<string, FieldInfo['control']> = {
    '': 'text',
    text: 'text',
    email: 'email',
    tel: 'tel',
    url: 'url',
    number: 'number',
    date: 'date',
  };

  const fields: FieldInfo[] = [];
  const radioGroups = new Map<string, HTMLInputElement[]>();

  for (const element of Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input, select, textarea',
    ),
  )) {
    if (element.hasAttribute(ATTR) || element.disabled) continue;

    if (element instanceof HTMLInputElement && element.type === 'radio') {
      const key = element.name || `sem-nome-${radioGroups.size}`;
      radioGroups.set(key, [...(radioGroups.get(key) ?? []), element]);
      continue;
    }
    if (element instanceof HTMLInputElement && element.type === 'file') {
      // O botão bonito costuma esconder o <input type=file>: vale mesmo oculto.
      if (element.files && element.files.length > 0) {
        element.setAttribute(ATTR, 'ja-tem');
        continue;
      }
      fields.push({ ...base(element), control: 'file', accept: element.accept });
      continue;
    }
    if (isHidden(element)) continue;
    if ('readOnly' in element && element.readOnly) continue;

    if (element instanceof HTMLSelectElement) {
      if (element.value !== '') {
        element.setAttribute(ATTR, 'ja-tem');
        continue;
      }
      fields.push({
        ...base(element),
        control: 'select',
        options: Array.from(element.options, (option) => clean(option.textContent)),
      });
      continue;
    }

    const control =
      element instanceof HTMLTextAreaElement ? 'textarea' : TEXT_TYPES[element.type.toLowerCase()];
    if (!control) continue; // senha, caixa de seleção, busca, botões...
    if (element.value.trim() !== '') {
      element.setAttribute(ATTR, 'ja-tem');
      continue;
    }
    const max = (element as HTMLInputElement).maxLength;
    fields.push({ ...base(element), control, maxLength: max > 0 ? max : null });
  }

  for (const radios of radioGroups.values()) {
    // Grupo ainda escondido (próxima etapa): fica para quando aparecer.
    if (radios.every((radio) => isHidden(radio, false))) continue;
    if (radios.some((radio) => radio.checked)) {
      radios.forEach((radio) => radio.setAttribute(ATTR, 'ja-tem'));
      continue;
    }
    const id = nextId();
    radios.forEach((radio, index) => {
      radio.setAttribute(ATTR, id);
      radio.setAttribute('data-bv-opt', String(index));
    });
    // A pergunta: legenda do grupo, rótulo do radiogroup ou o texto antes.
    let box: Element | null = radios[0]!.parentElement;
    while (box && !radios.every((radio) => box!.contains(radio))) box = box.parentElement;
    const group = radios[0]!.closest('fieldset, [role="radiogroup"]');
    const legend = group?.querySelector('legend');
    const question =
      (legend ? ownText(legend) : '') ||
      byIds(group?.getAttribute('aria-labelledby') ?? null) ||
      clean(group?.getAttribute('aria-label')) ||
      (box ? precedingText(box) : '');
    fields.push({
      id,
      control: 'radio',
      label: question,
      name: radios[0]!.name,
      htmlId: '',
      placeholder: '',
      autocomplete: '',
      options: radios.map(
        (radio) =>
          clean(
            Array.from(radio.labels ?? [])
              .map((label) => ownText(label))
              .join(' '),
          ) ||
          clean(radio.getAttribute('aria-label')) ||
          clean(radio.nextSibling?.textContent) ||
          radio.value,
      ),
      accept: '',
      maxLength: null,
    });
  }

  return fields;
}

/**
 * Escreve as respostas como se fosse digitado (o React e afins percebem) e
 * destaca o campo. Campo que ganhou valor nesse meio-tempo fica como está.
 * Devolve os ids preenchidos.
 */
export function applyAnswers({
  answers,
  restricted,
}: {
  answers: Apply[];
  restricted: readonly string[];
}): string[] {
  const host = location.hostname.toLowerCase().replace(/\.+$/, '');
  if (restricted.some((site) => host === site || host.endsWith(`.${site}`))) return [];

  const done: string[] = [];
  const mark = (element: HTMLElement) => {
    element.setAttribute('data-bv-filled', '');
    element.style.outline = '2px solid #8b7cf6';
    element.style.outlineOffset = '2px';
  };
  const fire = (element: Element) => {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };

  for (const answer of answers) {
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>(`[data-bv-id="${CSS.escape(answer.id)}"]`),
    );
    const element = elements[0];
    if (!element) continue;

    if (element instanceof HTMLInputElement && element.type === 'radio') {
      const radio = elements[answer.index ?? -1] as HTMLInputElement | undefined;
      if (!radio || elements.some((other) => (other as HTMLInputElement).checked)) continue;
      // Clicar num radio só marca a opção (não envia nada).
      radio.click();
      mark(radio);
    } else if (element instanceof HTMLSelectElement) {
      if (element.value !== '' || answer.index === undefined) continue;
      element.selectedIndex = answer.index;
      fire(element);
      mark(element);
    } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      if (element.value.trim() !== '' || answer.value === undefined) continue;
      const proto =
        element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(element, answer.value);
      fire(element);
      mark(element);
    } else {
      continue;
    }
    done.push(answer.id);
  }
  return done;
}

/** Quantos campos de arquivo o quadro tem (todos, já vistos ou não). */
export function countFileInputs(restricted: readonly string[]): number {
  const host = location.hostname.toLowerCase().replace(/\.+$/, '');
  if (restricted.some((site) => host === site || host.endsWith(`.${site}`))) return 0;
  return Array.from(document.querySelectorAll('input')).filter((input) => input.type === 'file')
    .length;
}

/** Destaca um campo preenchido fora daqui (o currículo no campo de arquivo). */
export function markFilled(id: string): void {
  const element = document.querySelector<HTMLElement>(`[data-bv-id="${CSS.escape(id)}"]`);
  // O <input type=file> costuma estar escondido: destaca quem está visível em volta.
  const target = element?.closest('label') ?? element?.parentElement ?? element;
  if (target instanceof HTMLElement) {
    target.style.outline = '2px solid #8b7cf6';
    target.style.outlineOffset = '2px';
  }
}

/** O aviso no canto da página: o que foi preenchido e que quem envia é você. */
export function showBanner({
  message,
  restricted,
}: {
  message: string;
  restricted: readonly string[];
}): void {
  const host = location.hostname.toLowerCase().replace(/\.+$/, '');
  if (restricted.some((site) => host === site || host.endsWith(`.${site}`))) return;

  const ID = 'buscavagas-aviso';
  const state = window as unknown as { __bvBannerClosed?: boolean };
  if (state.__bvBannerClosed) return;
  let banner = document.getElementById(ID);
  if (!banner) {
    banner = document.createElement('div');
    banner.id = ID;
    banner.setAttribute('role', 'status');
    Object.assign(banner.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      zIndex: '2147483647',
      maxWidth: '360px',
      padding: '12px 36px 12px 14px',
      borderRadius: '12px',
      background: '#17142a',
      color: '#eeeaf8',
      font: '14px/1.4 system-ui, sans-serif',
      boxShadow: '0 8px 24px rgba(0,0,0,.35)',
      border: '1px solid #8b7cf6',
    });
    const text = document.createElement('p');
    text.style.margin = '0';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Fechar aviso do BuscaVagas');
    Object.assign(close.style, {
      position: 'absolute',
      top: '6px',
      right: '8px',
      border: '0',
      background: 'transparent',
      color: 'inherit',
      font: '20px/1 system-ui, sans-serif',
      cursor: 'pointer',
    });
    close.addEventListener('click', () => {
      state.__bvBannerClosed = true;
      banner!.remove();
    });
    banner.append(text, close);
    document.body.append(banner);
  }
  banner.querySelector('p')!.textContent = message;
}
