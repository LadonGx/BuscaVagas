import type { JobDto, JobLookupDto } from '@busca-vagas/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageData, TabInfo } from './page';
import { startPopup, type PopupDeps } from './popup';

const job = (overrides: Partial<JobDto> = {}): JobDto =>
  ({
    id: 'j1',
    source: 'manual',
    title: 'Desenvolvedor Júnior',
    company: 'wevy',
    triage: 'inbox',
    application: null,
    score: null,
    scorePending: true,
    ...overrides,
  }) as JobDto;

interface Setup {
  tab: TabInfo;
  page?: PageData | null;
  /** Endereços que respondem ao /api/health. */
  up?: string[];
  lookup?: JobLookupDto;
}

function setup({ tab, page = null, up = ['http://127.0.0.1:8080'], lookup }: Setup) {
  const calls: { url: string; body?: unknown }[] = [];
  const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const base = new URL(url).origin;
    if (!up.includes(base)) throw new TypeError('Failed to fetch');
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    if (url.endsWith('/api/health')) return json(200, { status: 'ok' });
    if (url.includes('/api/jobs/lookup')) {
      return json(200, lookup ?? { match: null, job: null, openUrl: null });
    }
    if (url.endsWith('/api/jobs') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as Partial<JobDto>;
      return json(201, job({ title: body.title, company: body.company, triage: body.triage }));
    }
    return json(404, { message: 'não achei' });
  });
  let saved: string | null = null;
  const deps: PopupDeps = {
    getActiveTab: async () => tab,
    readPage: vi.fn(async () => page),
    fetch: fetchFn as unknown as typeof fetch,
    loadAppUrl: async () => saved,
    saveAppUrl: async (url) => {
      saved = url;
    },
    openTab: vi.fn(),
  };
  return { deps, calls };
}

const root = () => document.getElementById('app')!;
const byLabel = (label: string) => {
  const element = [...root().querySelectorAll('label')].find((l) => l.textContent === label)!;
  return document.getElementById(element.htmlFor) as HTMLInputElement;
};
const button = (name: string) =>
  [...root().querySelectorAll('button')].find((b) => b.textContent === name)!;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  document.body.innerHTML = '<main id="app"></main>';
});

describe('janelinha da extensão', () => {
  it('LinkedIn: não lê a página; título da aba vira o rascunho; "Salvar" manda já salva', async () => {
    const { deps, calls } = setup({
      tab: {
        id: 7,
        url: 'https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4476236394',
        title: '(2) Desenvolvedor Júnior | wevy | LinkedIn',
      },
    });
    await startPopup(root(), deps);

    expect(deps.readPage).not.toHaveBeenCalled();
    expect(root().textContent).toContain('não permite que a extensão leia a página');
    expect(byLabel('Título').value).toBe('Desenvolvedor Júnior');
    expect(byLabel('Empresa').value).toBe('wevy');
    // Consultou o app com o link "de uma vaga".
    expect(calls.find((c) => c.url.includes('/lookup'))?.url).toContain(
      encodeURIComponent('https://www.linkedin.com/jobs/view/4476236394'),
    );

    byLabel('Local').value = 'Brasil';
    button('Salvar').click();
    await flush();
    await flush();

    const post = calls.find((c) => c.body);
    expect(post?.body).toMatchObject({
      title: 'Desenvolvedor Júnior',
      company: 'wevy',
      location: 'Brasil',
      url: 'https://www.linkedin.com/jobs/view/4476236394',
      triage: 'saved',
    });
    expect(root().textContent).toContain('Salva no app');
    button('Abrir no app').click();
    expect(deps.openTab).toHaveBeenCalledWith('http://127.0.0.1:8080/vagas?vaga=j1');
  });

  it('LinkedIn: o texto colado traz local, modalidade, data e descrição', async () => {
    const { deps, calls } = setup({
      tab: {
        id: 7,
        url: 'https://www.linkedin.com/jobs/view/4466561696/',
        title: 'Desenvolvedor(a) Full Stack Júnior – Node.js | React Native | Vericode | LinkedIn',
      },
    });
    deps.now = () => new Date(2026, 9, 15, 12);
    await startPopup(root(), deps);

    expect(byLabel('Título').value).toBe(
      'Desenvolvedor(a) Full Stack Júnior – Node.js | React Native',
    );
    expect(byLabel('Empresa').value).toBe('Vericode');
    expect(root().querySelector('details')?.open).toBe(true);

    // Você corrigiu o título à mão: o texto colado não mexe nele.
    byLabel('Título').value = 'Dev Full Stack Júnior';
    const paste = root().querySelector<HTMLTextAreaElement>('#pasted')!;
    paste.value = [
      'Vericode',
      'Desenvolvedor(a) Full Stack Júnior – Node.js | React Native',
      'Brasil · há 1 semana · Mais de 100 pessoas clicaram em Candidate-se',
      'Respostas gerenciadas fora do LinkedIn',
      'Remoto',
      'Tempo integral',
      'Candidatar-se',
      'Sobre a vaga',
      'Vaga para dev com Node.js e React Native. Contratação PJ.',
    ].join('\n');
    paste.dispatchEvent(new Event('input'));

    expect(byLabel('Título').value).toBe('Dev Full Stack Júnior');
    expect(byLabel('Local').value).toBe('Brasil');
    expect(root().querySelector<HTMLSelectElement>('#workModel')!.value).toBe('remote');
    expect(root().textContent).toContain(
      'Do texto: local, modalidade, data (há 1 semana), contrato e descrição.',
    );

    button('Mandar para a Caixa').click();
    await flush();
    await flush();
    expect(calls.find((c) => c.body)?.body).toMatchObject({
      title: 'Dev Full Stack Júnior',
      company: 'Vericode',
      location: 'Brasil',
      workModel: 'remote',
      contractType: 'pj',
      description: 'Vaga para dev com Node.js e React Native. Contratação PJ.',
      postedAt: '2026-10-08T00:00:00.000Z',
      triage: 'inbox',
    });
  });

  it('site com JSON-LD: preenche sozinho e "Mandar para a Caixa"', async () => {
    const { deps, calls } = setup({
      tab: { id: 3, url: 'https://acme.gupy.io/jobs/1', title: 'Vaga - Acme' },
      page: {
        siteName: 'Gupy',
        jsonLd: [
          JSON.stringify({
            '@type': 'JobPosting',
            title: 'Dev Backend',
            hiringOrganization: { name: 'Acme' },
            jobLocationType: 'TELECOMMUTE',
            description: '<p>Node e Postgres</p>',
          }),
        ],
      },
    });
    await startPopup(root(), deps);

    expect(deps.readPage).toHaveBeenCalledWith(3);
    expect(byLabel('Título').value).toBe('Dev Backend');
    expect(byLabel('Empresa').value).toBe('Acme');
    expect(root().querySelector<HTMLSelectElement>('#workModel')!.value).toBe('remote');

    button('Mandar para a Caixa').click();
    await flush();
    await flush();
    expect(calls.find((c) => c.body)?.body).toMatchObject({
      title: 'Dev Backend',
      description: 'Node e Postgres',
      workModel: 'remote',
      triage: 'inbox',
    });
    expect(root().textContent).toContain('Está na Caixa');
  });

  it('já está no app: mostra o estado e não oferece mandar de novo', async () => {
    const { deps, calls } = setup({
      tab: {
        id: 1,
        url: 'https://www.linkedin.com/jobs/view/4476236394/',
        title: 'Dev | wevy | LinkedIn',
      },
      lookup: {
        match: 'same',
        job: job({ source: 'linkedin', triage: 'saved', score: 720, scorePending: false }),
        openUrl: null,
      },
    });
    await startPopup(root(), deps);

    expect(root().textContent).toContain('A mesma vaga já está no app');
    expect(root().textContent).toContain('Salva · nota 720');
    expect(root().textContent).toContain('Veio de LinkedIn (alerta por e-mail), com outro link.');
    expect(button('Salvar')).toBeUndefined();
    expect(calls.some((c) => c.body)).toBe(false);
  });

  it('candidatura feita aparece no estado', async () => {
    const { deps } = setup({
      tab: { id: 1, url: 'https://acme.gupy.io/jobs/9', title: 'Dev' },
      lookup: {
        match: 'link',
        job: job({ application: { id: 'a1', status: 'in_process' } }),
        openUrl: null,
      },
    });
    await startPopup(root(), deps);
    expect(root().textContent).toContain('Você já se candidatou (Em processo)');
  });

  it('sem título ou empresa: avisa e não manda', async () => {
    const { deps, calls } = setup({
      tab: { id: 1, url: 'https://br.indeed.com/viewjob?jk=a1', title: 'Indeed' },
    });
    await startPopup(root(), deps);
    button('Mandar para a Caixa').click();
    await flush();
    expect(root().textContent).toContain('Preencha título e empresa.');
    expect(byLabel('Empresa').getAttribute('aria-invalid')).toBe('true');
    expect(calls.some((c) => c.body)).toBe(false);
  });

  it('app fora do ar: diz onde procurou; o endereço salvo é usado na próxima tentativa', async () => {
    const { deps } = setup({
      tab: { id: 1, url: 'https://acme.gupy.io/jobs/1', title: 'Dev | Acme' },
      up: ['http://127.0.0.1:9000'],
    });
    await startPopup(root(), deps);
    expect(root().textContent).toContain(
      'Não achei o BuscaVagas em 127.0.0.1:8080 nem em 127.0.0.1:3333',
    );

    const input = root().querySelector<HTMLInputElement>('#app-url')!;
    input.value = 'http://127.0.0.1:9000';
    root().querySelector('form')!.requestSubmit();
    await vi.waitFor(() => expect(button('Mandar para a Caixa')).toBeDefined());
    expect(await deps.loadAppUrl()).toBe('http://127.0.0.1:9000');
  });

  it('página que não é de site (chrome://): explica', async () => {
    const { deps } = setup({ tab: { id: 1, url: 'chrome://extensions', title: 'Extensões' } });
    await startPopup(root(), deps);
    expect(root().textContent).toContain('Abra a página de uma vaga');
  });
});
