import { describe, expect, it } from 'vitest';
import type { HttpClient } from '../core/http';
import page1 from './__fixtures__/page-1.json';
import { parseTemplateConfig } from './template.config';
import { mapTemplateJob } from './template.mapper';
import { TemplateSource } from './template.source';

/** Cliente falso: devolve a fixture e registra as URLs pedidas. */
function fakeHttp(response: unknown) {
  const calls: string[] = [];
  const http: HttpClient = {
    getJson: async (url) => {
      calls.push(url);
      return response;
    },
    getText: async () => '',
  };
  return { http, calls };
}

describe('mapTemplateJob', () => {
  it('converte o item do site para JobPosting', () => {
    expect(mapTemplateJob(page1.jobs[0])).toEqual({
      source: 'template',
      externalId: '101',
      url: 'https://jobs.example.com/vagas/101',
      title: 'Desenvolvedor Full Stack Júnior',
      company: 'Empresa Exemplo',
      description: 'Node.js, NestJS e PostgreSQL.',
      location: 'Americana, SP',
      workModel: 'remote',
      contractType: null,
      seniority: null,
      stack: [],
      salary: null,
      postedAt: '2026-10-01T09:30:00.000Z',
    });
  });

  it('descarta item fora do formato', () => {
    expect(mapTemplateJob(page1.jobs[1])).toBeNull();
  });
});

describe('TemplateSource', () => {
  it('busca pelo termo, mapeia e conta os descartados', async () => {
    const { http, calls } = fakeHttp(page1);
    const source = new TemplateSource();

    const result = await source.fetch(
      { terms: ['node'] },
      { http, signal: new AbortController().signal, log: () => {} },
    );

    expect(calls).toEqual(['https://jobs.example.com/api/jobs?q=node&page=1']);
    expect(result.jobs).toHaveLength(1);
    expect(result.dropped).toBe(1);
  });

  it('para sem lançar quando a resposta muda de formato', async () => {
    const { http } = fakeHttp({ unexpected: true });
    const logs: string[] = [];

    const result = await new TemplateSource().fetch(
      {},
      { http, signal: new AbortController().signal, log: (m) => logs.push(m) },
    );

    expect(result).toEqual({ jobs: [], dropped: 0 });
    expect(logs[0]).toContain('formato inesperado');
  });
});

describe('configuração', () => {
  it('padrão sem nada no .env; lê só as variáveis com o prefixo', () => {
    expect(parseTemplateConfig({})).toEqual({ maxPages: 3 });
    expect(parseTemplateConfig({ TEMPLATE_MAX_PAGES: '5', OTHER_MAX_PAGES: '9' })).toEqual({
      maxPages: 5,
    });
  });

  it('valor inválido lança com o nome da variável', () => {
    expect(() => parseTemplateConfig({ TEMPLATE_MAX_PAGES: '99' })).toThrow(/TEMPLATE_MAX_PAGES/);
  });
});
