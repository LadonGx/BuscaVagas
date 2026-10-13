import type { ResumeImportApplyInput, ResumeImportLine } from '@busca-vagas/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, reply } from '../../../test/api-mock';
import { layoutRoutes, resume } from '../../../test/fixtures';
import { renderApp } from '../../../test/render';
import { PdfReadError, readPdfLines } from './readPdf';

// O pdf.js não roda no jsdom: a leitura é trocada pelas linhas "do PDF".
vi.mock('./readPdf', async (original) => ({
  ...(await original<typeof import('./readPdf')>()),
  readPdfLines: vi.fn(),
}));

const line = (text: string, size = 10, bold = false): ResumeImportLine => ({
  text,
  size,
  bold,
  page: 1,
});

const PDF: ResumeImportLine[] = [
  line('Ana Souza Lima', 20, true),
  line('Desenvolvedora Full Stack', 12),
  line('ana@email.com · (19) 99876-5432 · Americana, SP'),
  line('EXPERIÊNCIA', 12, true),
  line('Desenvolvedora Jr', 10, true),
  line('Lumen · jan/2025 – atual'),
  line('• APIs em NestJS.'),
  line('Estagiária', 10, true),
  line('Beta | 03/2024 - 12/2024'),
  line('• Suporte ao time.'),
];

function setup() {
  const posts: ResumeImportApplyInput[] = [];
  let fail = false;
  mockApi({
    ...layoutRoutes(),
    'GET /resume': () => resume(),
    'POST /resume/import': (_url, init) => {
      posts.push(JSON.parse(String(init.body)) as ResumeImportApplyInput);
      if (fail) return reply(400, { statusCode: 400, message: 'Dados inválidos' });
      return resume();
    },
  });
  return { posts, failNext: () => (fail = true) };
}

async function openDialog() {
  const user = userEvent.setup();
  renderApp('/curriculo');
  await user.click(await screen.findByRole('button', { name: 'Escolher arquivo' }));
  const dialog = await screen.findByRole('dialog', { name: 'Importar de PDF' });
  return { user, dialog };
}

const file = () => new File(['%PDF-1.7'], 'curriculo.pdf', { type: 'application/pdf' });

describe('Importar de PDF', () => {
  beforeEach(() => {
    vi.mocked(readPdfLines).mockResolvedValue(PDF);
  });

  it('lê o PDF, mostra a revisão (só completa) e aplica o que ficou marcado', async () => {
    const { posts } = setup();
    const { user, dialog } = await openDialog();

    await user.upload(within(dialog).getByLabelText('Arquivo PDF do currículo'), file());
    expect(
      await within(dialog).findByText(/Achei: nome, contato, Experiência \(2\)\./),
    ).toBeInTheDocument();

    // Nome já preenchido: aparece desmarcado, com o valor atual.
    const dados = within(dialog).getByRole('region', { name: 'Dados pessoais' });
    expect(
      within(dados).getByRole('checkbox', { name: 'Importar: Nome completo' }),
    ).not.toBeChecked();
    expect(dados).toHaveTextContent('Agora: Ana Souza');
    // Telefone vazio: marcado.
    const contato = within(dialog).getByRole('region', { name: 'Contato' });
    expect(
      within(contato).getByRole('checkbox', { name: 'Importar: Telefone/WhatsApp' }),
    ).toBeChecked();

    // Experiência repetida vem desmarcada; a nova, marcada e editável.
    const exp = within(dialog).getByRole('region', { name: 'Experiência' });
    expect(
      within(exp).getByRole('checkbox', { name: 'Importar: Desenvolvedora Jr' }),
    ).not.toBeChecked();
    expect(exp).toHaveTextContent('já existe no currículo');
    const titles = within(exp).getAllByRole('textbox', { name: 'Título' });
    await user.clear(titles[1]!);
    await user.type(titles[1]!, 'Estagiária de TI');

    // Links não existe no currículo: seção nova.
    expect(within(dialog).queryByRole('region', { name: 'Links' })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /^Aplicar \d+ mudanças$/ }));
    await waitFor(() => expect(posts).toHaveLength(1));
    const [body] = posts;
    expect(body!.updates).toContainEqual({
      itemId: 'i-tel',
      data: { label: 'Telefone/WhatsApp', value: '(19) 99876-5432' },
    });
    expect(body!.updates.find((u) => u.itemId === 'i-nome')).toBeUndefined();
    expect(body!.creates).toContainEqual({
      sectionId: 's-exp',
      data: expect.objectContaining({ title: 'Estagiária de TI', organization: 'Beta' }),
    });
    expect(body!.creates.filter((c) => c.sectionId === 's-exp')).toHaveLength(1);

    expect(
      await screen.findByText(/Currículo atualizado com \d+ itens do PDF\./),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Importar de PDF' })).not.toBeInTheDocument(),
    );
  });

  it('PDF sem texto: explica e deixa escolher outro', async () => {
    setup();
    vi.mocked(readPdfLines).mockRejectedValue(
      new PdfReadError('Este PDF não tem texto — parece uma imagem escaneada.'),
    );
    const { user, dialog } = await openDialog();

    await user.upload(within(dialog).getByLabelText('Arquivo PDF do currículo'), file());
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'parece uma imagem escaneada',
    );
    expect(within(dialog).getByRole('button', { name: 'Escolher o PDF' })).toBeEnabled();
  });

  it('desmarcar tudo desliga "Aplicar"; entrada sem título também; erro da API aparece', async () => {
    const { failNext } = setup();
    const { user, dialog } = await openDialog();
    await user.upload(within(dialog).getByLabelText('Arquivo PDF do currículo'), file());
    await within(dialog).findByText(/Achei:/);

    const exp = within(dialog).getByRole('region', { name: 'Experiência' });
    await user.clear(within(exp).getAllByRole('textbox', { name: 'Título' })[1]!);
    expect(within(dialog).getByText(/está sem título/)).toBeInTheDocument();
    const apply = within(dialog).getByRole('button', { name: /^Aplicar/ });
    expect(apply).toBeDisabled();
    await user.type(within(exp).getAllByRole('textbox', { name: 'Título' })[1]!, 'Estágio');
    expect(apply).toBeEnabled();

    failNext();
    await user.click(apply);
    expect(await within(dialog).findByText('Dados inválidos')).toBeInTheDocument();

    for (const box of within(dialog).getAllByRole('checkbox')) {
      if ((box as HTMLInputElement).checked) await user.click(box);
    }
    expect(within(dialog).getByRole('button', { name: 'Aplicar 0 mudanças' })).toBeDisabled();
  });
});
