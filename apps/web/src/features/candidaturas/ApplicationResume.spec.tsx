import type { ApplicationDetailDto, ResumeDto } from '@busca-vagas/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fileToBase64 } from '../../api/applications';
import { mockApi } from '../../test/api-mock';
import { application, layoutRoutes, resume } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { formatFileSize } from './ApplicationResume';

const SAVED_AT = '2026-10-04T13:00:00.000Z';

/** O currículo de hoje: e-mail novo e uma experiência a mais. */
function today(): ResumeDto {
  const now = resume();
  now.sections[1]!.items[0]!.data = { label: 'E-mail', value: 'ana.souza@email.com' };
  now.sections[3]!.items.push({
    id: 'i-exp2',
    position: 1,
    data: { title: 'Estagiária', organization: 'Beta', current: false },
  });
  return now;
}

type Call = { method: string; path: string; body?: unknown };

function setup(initial: ApplicationDetailDto) {
  let current = structuredClone(initial);
  const calls: Call[] = [];
  const body = (init: RequestInit) => (init.body ? JSON.parse(String(init.body)) : undefined);
  mockApi({
    ...layoutRoutes(),
    'GET /applications': () => ({ items: [current], nextCursor: null }),
    'GET /applications/:id': () => current,
    'GET /applications/:id/resume': () => ({ id: 'snap-1', savedAt: SAVED_AT, ...resume() }),
    'GET /resume': () => today(),
    'POST /applications/:id/resume': (_u, _i, { id }) => {
      calls.push({ method: 'POST', path: `/applications/${id}/resume` });
      current = {
        ...current,
        resume: { snapshotId: 'snap-2', savedAt: new Date().toISOString(), sameAsCurrent: true },
      };
      return current;
    },
    'PUT /applications/:id/resume-file': (_u, init, { id }) => {
      const input = body(init) as { name: string; contentBase64: string };
      calls.push({ method: 'PUT', path: `/applications/${id}/resume-file`, body: input });
      current = {
        ...current,
        resumeFile: { name: input.name, size: 250_000, uploadedAt: new Date().toISOString() },
      };
      return current;
    },
    'DELETE /applications/:id/resume-file': (_u, _i, { id }) => {
      calls.push({ method: 'DELETE', path: `/applications/${id}/resume-file` });
      current = { ...current, resumeFile: null };
      return current;
    },
  });
  return { calls };
}

async function openSection(options: Parameters<typeof userEvent.setup>[0] = {}) {
  const user = userEvent.setup(options);
  renderApp('/candidaturas/app-1');
  const drawer = await screen.findByRole('dialog', { name: /Back-end Jr/ });
  const section = within(drawer).getByRole('region', { name: 'Currículo enviado' });
  return { user, section };
}

describe('Currículo enviado', () => {
  it('cópia que mudou: selo, imprimir e o que mudou desde a candidatura', async () => {
    setup(
      application({ resume: { snapshotId: 'snap-1', savedAt: SAVED_AT, sameAsCurrent: false } }),
    );
    const { user, section } = await openSection();

    expect(section).toHaveTextContent('guardado em 04/10/2026');
    expect(section).toHaveTextContent('Mudou desde então');
    expect(within(section).getByRole('link', { name: 'Ver e imprimir' })).toHaveAttribute(
      'href',
      '/curriculo/imprimir?candidatura=app-1',
    );

    await user.click(within(section).getByRole('button', { name: 'Comparar com o atual' }));
    const changes = await within(section).findByRole('list', {
      name: 'O que mudou desde a candidatura',
    });
    const lines = within(changes).getAllByRole('listitem');
    expect(lines.map((line) => line.textContent)).toEqual([
      'Contato · E-mail: Valorana@email.com → ana.souza@email.com',
      'Entrou: Experiência · Estagiária — Beta',
    ]);
  });

  it('igual ao de hoje: sem comparar nem trocar', async () => {
    setup(
      application({ resume: { snapshotId: 'snap-1', savedAt: SAVED_AT, sameAsCurrent: true } }),
    );
    const { section } = await openSection();
    expect(section).toHaveTextContent('Igual ao de hoje');
    expect(within(section).queryByRole('button', { name: /Comparar/ })).not.toBeInTheDocument();
    expect(
      within(section).queryByRole('button', { name: /Guardar o de hoje/ }),
    ).not.toBeInTheDocument();
  });

  it('trocar pela de hoje pede confirmação', async () => {
    const { calls } = setup(
      application({ resume: { snapshotId: 'snap-1', savedAt: SAVED_AT, sameAsCurrent: false } }),
    );
    const { user, section } = await openSection();

    await user.click(within(section).getByRole('button', { name: 'Guardar o de hoje…' }));
    expect(calls).toEqual([]);
    await user.click(within(section).getByRole('button', { name: 'Trocar pela de hoje' }));
    await waitFor(() => expect(section).toHaveTextContent('Igual ao de hoje'));
    expect(calls).toEqual([{ method: 'POST', path: '/applications/app-1/resume' }]);
  });

  it('candidatura sem cópia: guardar a de hoje', async () => {
    const { calls } = setup(application());
    const { user, section } = await openSection();

    expect(section).toHaveTextContent('Sem cópia do currículo do app');
    await user.click(within(section).getByRole('button', { name: 'Guardar o currículo de hoje' }));
    await waitFor(() => expect(section).toHaveTextContent('Igual ao de hoje'));
    expect(calls).toHaveLength(1);
  });

  it('PDF enviado: anexa em base64, baixa e remove com confirmação', async () => {
    const { calls } = setup(application());
    const { user, section } = await openSection();
    const file = new File(['%PDF-1.4 teste'], 'Curriculo ATS.pdf', { type: 'application/pdf' });

    await user.upload(within(section).getByLabelText('Anexar o PDF enviado'), file);
    await waitFor(() => expect(section).toHaveTextContent('Curriculo ATS.pdf'));
    expect(calls[0]).toEqual({
      method: 'PUT',
      path: '/applications/app-1/resume-file',
      body: { name: 'Curriculo ATS.pdf', contentBase64: btoa('%PDF-1.4 teste') },
    });
    expect(section).toHaveTextContent('244 KB');
    expect(within(section).getByRole('link', { name: 'Baixar' })).toHaveAttribute(
      'href',
      '/api/applications/app-1/resume-file',
    );

    await user.click(within(section).getByRole('button', { name: 'Remover…' }));
    await user.click(within(section).getByRole('button', { name: 'Remover o PDF' }));
    await waitFor(() => expect(section).not.toHaveTextContent('Curriculo ATS.pdf'));
    expect(calls.at(-1)).toEqual({ method: 'DELETE', path: '/applications/app-1/resume-file' });
  });

  it('PDF: recusa outro tipo de arquivo antes de enviar', async () => {
    const { calls } = setup(application());
    // O navegador já filtra pelo `accept`; aqui simulamos quem escolhe "Todos os arquivos".
    const { user, section } = await openSection({ applyAccept: false });
    const image = new File(['png'], 'foto.png', { type: 'image/png' });

    await user.upload(within(section).getByLabelText('Anexar o PDF enviado'), image);
    expect(await screen.findByText('Escolha um arquivo PDF.')).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it('página de impressão da candidatura mostra a cópia, não o currículo de hoje', async () => {
    setup(
      application({ resume: { snapshotId: 'snap-1', savedAt: SAVED_AT, sameAsCurrent: false } }),
    );
    renderApp('/curriculo/imprimir?candidatura=app-1');

    expect(await screen.findByText('Versão enviada em 04/10/2026')).toBeInTheDocument();
    expect(await screen.findByText(/Back-end Jr \(NestJS\) · Lumen Saúde/)).toBeInTheDocument();
    const paper = screen.getByRole('article', { name: 'Prévia do currículo' });
    expect(paper).toHaveTextContent('ana@email.com');
    expect(paper).not.toHaveTextContent('ana.souza@email.com');
    expect(screen.getByRole('link', { name: 'Voltar à candidatura' })).toHaveAttribute(
      'href',
      '/candidaturas/app-1',
    );
  });
});

describe('peças', () => {
  it('tamanho do arquivo', () => {
    expect(formatFileSize(300)).toBe('1 KB');
    expect(formatFileSize(250_000)).toBe('244 KB');
    expect(formatFileSize(1_300_000)).toBe('1,2 MB');
  });

  it('base64 de arquivo grande, em pedaços', async () => {
    const bytes = new Uint8Array(100_000).map((_, index) => index % 256);
    const encoded = await fileToBase64(new Blob([bytes]));
    expect(atob(encoded).length).toBe(100_000);
    expect(atob(encoded).charCodeAt(99_999)).toBe(99_999 % 256);
  });
});
