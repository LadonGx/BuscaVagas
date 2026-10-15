import {
  APPLICATION_STATUS_LABELS,
  EMAIL_ALERT_SITES,
  MANUAL_SOURCE,
  WORK_MODEL_LABELS,
  WORK_MODELS,
  type JobDto,
  type JobLookupDto,
  type WorkModel,
} from '@busca-vagas/shared';
import {
  AppError,
  createJob,
  DEFAULT_APP_URLS,
  findApp,
  lookupJob,
  normalizeAppUrl,
  openUrlFor,
} from './app-client';
import { toCreateInput, type Draft } from './draft';
import { readTab, type PageReader, type TabInfo } from './page';
import { describePasted, readPastedText, type PastedFields } from './pasted-text';

/**
 * A janelinha da extensão (docs/features/21-extension.md): lê a vaga da aba,
 * pergunta ao app se ela já está lá e mostra o formulário para conferir.
 * As dependências do Chrome entram por parâmetro, para os testes.
 */
export interface PopupDeps {
  getActiveTab(): Promise<TabInfo>;
  readPage: PageReader;
  fetch: typeof fetch;
  loadAppUrl(): Promise<string | null>;
  saveAppUrl(url: string): Promise<void>;
  openTab(url: string): void;
  /** Relógio (as idades do texto colado, "há 1 semana"). Trocável nos testes. */
  now?: () => Date;
}

type Attrs = Record<string, string | boolean | undefined>;

/** `createElement` com atributos e filhos (texto sempre como texto, nunca HTML). */
function h(tag: string, attrs: Attrs = {}, ...children: (Node | string | null | false)[]) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (value === true) element.setAttribute(key, '');
    else element.setAttribute(key, value);
  }
  for (const child of children) {
    if (child === null || child === false) continue;
    element.append(child);
  }
  return element;
}

export function sourceName(source: string): string {
  if (source === MANUAL_SOURCE) return 'cadastro manual';
  if (source in EMAIL_ALERT_SITES) {
    return `${EMAIL_ALERT_SITES[source as keyof typeof EMAIL_ALERT_SITES]} (alerta por e-mail)`;
  }
  return source.charAt(0).toUpperCase() + source.slice(1);
}

/** "Salva · nota 720", "Você já se candidatou (Em processo)". */
export function jobState(job: JobDto): string {
  const where = job.application
    ? `Você já se candidatou (${APPLICATION_STATUS_LABELS[job.application.status]})`
    : job.triage === 'saved'
      ? 'Salva'
      : job.triage === 'dismissed'
        ? 'Descartada'
        : 'Na Caixa';
  const score =
    job.score !== null ? ` · nota ${job.score}` : job.scorePending ? ' · nota sendo calculada' : '';
  return `${where}${score}`;
}

export async function startPopup(root: HTMLElement, deps: PopupDeps): Promise<void> {
  const show = (...nodes: Node[]) => root.replaceChildren(...nodes);
  const message = (text: string, tone: 'info' | 'error' = 'info') =>
    h('p', { class: `message ${tone}`, role: tone === 'error' ? 'alert' : 'status' }, text);

  show(message('Lendo a vaga…'));

  const tab = await deps.getActiveTab();
  const read = await readTab(tab, deps.readPage);
  if (read.kind === 'not-a-page') {
    show(message('Abra a página de uma vaga no navegador e clique de novo na extensão.'));
    return;
  }

  const base = await findApp(deps.fetch, await deps.loadAppUrl());
  if (!base) {
    showAppMissing();
    return;
  }

  let lookup: JobLookupDto | null;
  try {
    lookup = await lookupJob(deps.fetch, base, {
      url: read.draft.url,
      title: read.draft.title,
      company: read.draft.company,
      location: read.draft.location,
    });
  } catch {
    lookup = null; // sem a consulta, segue com o formulário
  }

  if (lookup?.job) {
    showExisting(base, lookup);
    return;
  }
  showForm(base, read.draft, read.restricted, read.fromJsonLd);

  /* ---------------------------------------------------------------- telas */

  function openButton(base: string, job: JobDto) {
    const button = h('button', { type: 'button', class: 'primary' }, 'Abrir no app');
    button.addEventListener('click', () => deps.openTab(openUrlFor(base, job.id)));
    return button;
  }

  function showExisting(base: string, found: JobLookupDto) {
    const job = found.job!;
    show(
      h(
        'section',
        { class: 'card', 'aria-label': 'Já está no app' },
        h(
          'p',
          { class: 'eyebrow' },
          found.match === 'same' ? 'A mesma vaga já está no app' : 'Já está no app',
        ),
        h('h1', {}, job.title),
        h('p', { class: 'muted' }, job.company),
        h('p', { class: 'state' }, jobState(job)),
        found.match === 'same'
          ? h('p', { class: 'muted small' }, `Veio de ${sourceName(job.source)}, com outro link.`)
          : null,
        openButton(base, job),
      ),
    );
  }

  function showAppMissing() {
    const input = h('input', {
      id: 'app-url',
      type: 'url',
      placeholder: DEFAULT_APP_URLS[0],
      spellcheck: 'false',
    }) as HTMLInputElement;
    void deps.loadAppUrl().then((saved) => {
      input.value = saved ?? '';
    });
    const retry = h('button', { type: 'submit', class: 'primary' }, 'Salvar e tentar de novo');
    const form = h(
      'form',
      { class: 'card', 'aria-label': 'App não encontrado' },
      message(
        `Não achei o BuscaVagas em ${DEFAULT_APP_URLS.map((url) => url.replace('http://', '')).join(' nem em ')}. O app está rodando?`,
        'error',
      ),
      h('label', { for: 'app-url' }, 'Endereço do app (opcional)'),
      input,
      retry,
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const url = input.value.trim() ? normalizeAppUrl(input.value) : null;
      if (input.value.trim() && !url) {
        input.setCustomValidity('Use um endereço desta máquina, ex.: http://127.0.0.1:8080');
        input.reportValidity();
        return;
      }
      void (async () => {
        if (url) await deps.saveAppUrl(url);
        await startPopup(root, deps);
      })();
    });
    show(form);
  }

  function showForm(base: string, draft: Draft, restricted: boolean, fromJsonLd: boolean) {
    const field = (id: string, label: string, value: string, required = false) => {
      const input = h('input', {
        id,
        name: id,
        value,
        required,
        maxlength: '200',
        autocomplete: 'off',
      }) as HTMLInputElement;
      return { input, node: h('div', { class: 'field' }, h('label', { for: id }, label), input) };
    };
    const title = field('title', 'Título', draft.title, true);
    const company = field('company', 'Empresa', draft.company, true);
    const location = field('location', 'Local', draft.location);
    const mode = h(
      'select',
      { id: 'workModel', name: 'workModel' },
      h('option', { value: '' }, 'Não informada'),
      ...WORK_MODELS.map((model) =>
        h(
          'option',
          { value: model, selected: draft.workModel === model },
          WORK_MODEL_LABELS[model],
        ),
      ),
    ) as HTMLSelectElement;

    const note = restricted
      ? 'Este site não permite que a extensão leia a página: só o link e o título da aba vieram. Para trazer local, modalidade e descrição, cole o texto da vaga abaixo.'
      : fromJsonLd
        ? 'Dados que a própria página publica. Confira antes de mandar.'
        : 'A página não traz os dados da vaga: confira e complete.';
    const status = h('p', { class: 'message', role: 'status' });

    // Texto colado (sem JSON-LD): preenche o que estiver vazio ou o que um
    // texto colado antes preencheu; o que você digitou fica.
    let pasted: PastedFields = {};
    const fromPaste = { title: '', company: '', location: '', workModel: '' };
    const pasteBox = h('textarea', {
      id: 'pasted',
      name: 'pasted',
      rows: '3',
      spellcheck: 'false',
      placeholder: 'Cole aqui o texto da vaga',
    }) as HTMLTextAreaElement;
    const pasteStatus = h('p', { class: 'muted small', role: 'status' });
    pasteBox.addEventListener('input', () => {
      pasted = readPastedText(pasteBox.value, deps.now?.() ?? new Date());
      for (const [key, input] of [
        ['title', title.input],
        ['company', company.input],
        ['location', location.input],
      ] as const) {
        const value = pasted[key];
        if (value && (!input.value.trim() || input.value === fromPaste[key])) {
          input.value = value;
          fromPaste[key] = value;
        }
      }
      if (pasted.workModel && (!mode.value || mode.value === fromPaste.workModel)) {
        mode.value = pasted.workModel;
        fromPaste.workModel = pasted.workModel;
      }
      pasteStatus.textContent = pasteBox.value.trim() ? describePasted(pasted) : '';
    });
    const pasteSection =
      !fromJsonLd &&
      h(
        'details',
        { class: 'paste', open: restricted },
        h('summary', {}, 'Colar o texto da vaga'),
        h(
          'p',
          { class: 'muted small' },
          'Na página, selecione do nome da empresa até o fim de "Sobre a vaga", copie (Ctrl+C) e cole aqui. A extensão usa só o que você colar.',
        ),
        pasteBox,
        pasteStatus,
      );
    const toInbox = h(
      'button',
      { type: 'submit', value: 'inbox', class: 'primary' },
      'Mandar para a Caixa',
    );
    const toSaved = h('button', { type: 'submit', value: 'saved' }, 'Salvar');

    const form = h(
      'form',
      { class: 'card', 'aria-label': 'Mandar vaga', novalidate: true },
      h('p', { class: 'muted small' }, note),
      title.node,
      company.node,
      location.node,
      h('div', { class: 'field' }, h('label', { for: 'workModel' }, 'Modalidade'), mode),
      pasteSection,
      h('p', { class: 'link', title: draft.url }, draft.url),
      h('div', { class: 'actions' }, toInbox, toSaved),
      status,
    ) as HTMLFormElement;

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const triage =
        ((event as SubmitEvent).submitter as HTMLButtonElement | null)?.value === 'saved'
          ? 'saved'
          : 'inbox';
      for (const { input } of [title, company]) {
        input.setAttribute('aria-invalid', String(!input.value.trim()));
      }
      if (!title.input.value.trim() || !company.input.value.trim()) {
        status.className = 'message error';
        status.textContent = 'Preencha título e empresa.';
        (title.input.value.trim() ? company.input : title.input).focus();
        return;
      }
      const hasSalary = draft.salaryMin !== null || draft.salaryMax !== null;
      const input = toCreateInput(
        {
          ...draft,
          description: pasted.description ?? draft.description,
          postedAt: draft.postedAt ?? pasted.postedAt ?? null,
          contractType: draft.contractType ?? pasted.contractType ?? null,
          ...(!hasSalary &&
            pasted.salaryMin !== undefined && {
              salaryMin: pasted.salaryMin,
              salaryMax: pasted.salaryMax ?? null,
              salaryCurrency: pasted.salaryCurrency ?? null,
              salaryPeriod: pasted.salaryPeriod ?? null,
            }),
          title: title.input.value,
          company: company.input.value,
          location: location.input.value,
          workModel: (mode.value || null) as WorkModel | null,
        },
        triage,
      );
      toInbox.toggleAttribute('disabled', true);
      toSaved.toggleAttribute('disabled', true);
      status.className = 'message';
      status.textContent = 'Mandando…';
      void createJob(deps.fetch, base, input)
        .then((job) => {
          show(
            h(
              'section',
              { class: 'card', 'aria-label': 'Vaga mandada' },
              h(
                'p',
                { class: 'eyebrow good' },
                triage === 'saved' ? 'Salva no app' : 'Está na Caixa',
              ),
              h('h1', {}, job.title),
              h('p', { class: 'muted' }, job.company),
              openButton(base, job),
            ),
          );
        })
        .catch((error: unknown) => {
          toInbox.toggleAttribute('disabled', false);
          toSaved.toggleAttribute('disabled', false);
          status.className = 'message error';
          status.textContent =
            error instanceof AppError
              ? error.message
              : 'Não consegui falar com o app. Ele está rodando?';
        });
    });

    show(form);
    (title.input.value ? (company.input.value ? toInbox : company.input) : title.input).focus();
  }
}
