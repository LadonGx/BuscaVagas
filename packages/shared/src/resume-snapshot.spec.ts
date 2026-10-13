import { describe, expect, it } from 'vitest';
import type { ResumeSectionDto } from './resume';
import {
  canonicalResume,
  describeResumeChange,
  diffResume,
  resumeFileInputSchema,
  resumeHasContent,
} from './resume-snapshot';

const resume = (): ResumeSectionDto[] => [
  {
    id: 's1',
    title: 'Contato',
    kind: 'fields',
    position: 0,
    items: [
      { id: 'i1', position: 0, data: { label: 'E-mail', value: 'voce@example.com' } },
      { id: 'i2', position: 1, data: { label: 'LinkedIn', value: '' } },
    ],
  },
  {
    id: 's2',
    title: 'Resumo',
    kind: 'text',
    position: 1,
    items: [{ id: 'i3', position: 0, data: { text: 'Dev full stack júnior.' } }],
  },
  {
    id: 's3',
    title: 'Experiência',
    kind: 'entries',
    position: 2,
    items: [
      {
        id: 'i4',
        position: 0,
        data: {
          title: 'Desenvolvedor',
          organization: 'Acme',
          location: null,
          startDate: '2025-07',
          endDate: null,
          current: true,
          description: '- APIs em NestJS',
        },
      },
    ],
  },
];

describe('cópia do currículo', () => {
  it('currículo com conteúdo', () => {
    expect(resumeHasContent(resume())).toBe(true);
    expect(
      resumeHasContent([
        {
          ...resume()[0]!,
          items: [{ id: 'x', position: 0, data: { label: 'E-mail', value: ' ' } }],
        },
      ]),
    ).toBe(false);
    expect(resumeHasContent([])).toBe(false);
  });

  it('texto canônico: ignora ordem das chaves e a numeração das posições', () => {
    const shuffled = resume().map((section) => ({ ...section, position: section.position * 10 }));
    shuffled.reverse();
    const first = shuffled.at(-1)!;
    first.items[0] = {
      id: 'i1',
      position: 3,
      data: { value: 'voce@example.com', label: 'E-mail' },
    };
    first.items[1] = { ...first.items[1]!, position: 9 };
    expect(canonicalResume(shuffled)).toBe(canonicalResume(resume()));

    const changed = resume();
    changed[0]!.items[0]!.data = { label: 'E-mail', value: 'outro@example.com' };
    expect(canonicalResume(changed)).not.toBe(canonicalResume(resume()));
  });

  it('PDF em base64: valida o formato', () => {
    expect(
      resumeFileInputSchema.safeParse({ name: 'cv.pdf', contentBase64: 'JVBERi0=' }).success,
    ).toBe(true);
    expect(resumeFileInputSchema.safeParse({ name: 'cv.pdf', contentBase64: 'a b' }).success).toBe(
      false,
    );
  });
});

describe('o que mudou desde a candidatura', () => {
  it('sem mudança: nada', () => {
    expect(diffResume(resume(), resume())).toEqual([]);
  });

  it('campo, texto, entrada, item novo e item que saiu', () => {
    const now = resume();
    now[0]!.items[0]!.data = { label: 'E-mail', value: 'novo@example.com' };
    now[0]!.items[1]!.data = { label: 'LinkedIn', value: 'linkedin.com/in/voce' };
    now[1]!.items[0]!.data = { text: 'Dev full stack com NestJS e React.' };
    now[2]!.items[0]!.data = {
      ...(now[2]!.items[0]!.data as object),
      endDate: '2026-04',
      current: false,
      description: '- APIs em NestJS\n- Apps em React Native',
    } as never;
    now[2]!.items.push({
      id: 'i5',
      position: 1,
      data: { title: 'Estagiário', organization: 'Beta', current: false },
    });

    const lines = diffResume(resume(), now).map(describeResumeChange);
    expect(lines).toEqual([
      'Contato · E-mail: Valor',
      'Contato · LinkedIn: Valor',
      'Resumo · Texto: Texto',
      'Experiência · Desenvolvedor — Acme: Período, Descrição',
      'Entrou: Experiência · Estagiário — Beta',
    ]);
    expect(diffResume(resume(), now)[0]).toMatchObject({
      before: 'voce@example.com',
      after: 'novo@example.com',
    });

    expect(diffResume(now, resume()).map(describeResumeChange)).toContain(
      'Saiu: Experiência · Estagiário — Beta',
    );
  });

  it('seções: nova, removida, renomeada e ordem', () => {
    const now = resume();
    now[1]!.title = 'Sobre mim';
    now.push({
      id: 's4',
      title: 'Idiomas',
      kind: 'fields',
      position: 3,
      items: [{ id: 'i6', position: 0, data: { label: 'Inglês', value: 'Avançado' } }],
    });
    now.splice(0, 1); // tirou Contato
    const swapped = [now[1]!, now[0]!, now[2]!].map((section, position) => ({
      ...section,
      position,
    }));

    expect(diffResume(resume(), swapped).map(describeResumeChange)).toEqual([
      'Ordem das seções mudou',
      'Seção renomeada: "Resumo" → "Sobre mim"',
      'Seção nova: Idiomas',
      'Seção removida: Contato',
    ]);
  });

  it('seção nova só com campos vazios não conta', () => {
    const now = resume();
    now.push({
      id: 's5',
      title: 'Links',
      kind: 'fields',
      position: 3,
      items: [{ id: 'i7', position: 0, data: { label: 'GitHub', value: '' } }],
    });
    expect(diffResume(resume(), now)).toEqual([]);
  });
});
