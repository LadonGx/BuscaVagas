import { describe, expect, it } from 'vitest';
import {
  bulkTriageInputSchema,
  createJobInputSchema,
  jobListQuerySchema,
  normalizeStack,
  triageInputSchema,
  updateJobInputSchema,
} from './jobs';

describe('normalizeStack', () => {
  it('padroniza, remove repetidos e mantém a ordem', () => {
    expect(normalizeStack([' TypeScript', 'nestjs', 'typescript ', '', 'NestJS'])).toEqual([
      'typescript',
      'nestjs',
    ]);
  });
});

describe('createJobInputSchema', () => {
  const base = { title: ' Dev Júnior ', company: 'Acme' };

  it('aplica defaults e apara textos', () => {
    const parsed = createJobInputSchema.parse(base);
    expect(parsed.title).toBe('Dev Júnior');
    expect(parsed.stack).toEqual([]);
  });

  it('URL vazia vira null; URL não-http é recusada', () => {
    expect(createJobInputSchema.parse({ ...base, url: '' }).url).toBeNull();
    expect(createJobInputSchema.safeParse({ ...base, url: 'ftp://x.com' }).success).toBe(false);
  });

  it('recusa faixa salarial invertida', () => {
    const result = createJobInputSchema.safeParse({ ...base, salaryMin: 5000, salaryMax: 3000 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['salaryMax']);
  });

  it('moeda em maiúsculas', () => {
    expect(createJobInputSchema.parse({ ...base, salaryCurrency: 'brl' }).salaryCurrency).toBe(
      'BRL',
    );
  });
});

describe('updateJobInputSchema', () => {
  it('não inventa stack vazia quando o campo não veio', () => {
    expect(updateJobInputSchema.parse({ notes: 'x' })).toEqual({ notes: 'x' });
  });

  it('null limpa o campo', () => {
    expect(updateJobInputSchema.parse({ location: null }).location).toBeNull();
  });
});

describe('jobListQuerySchema', () => {
  it('converte filtros da query string', () => {
    expect(
      jobListQuerySchema.parse({
        workModel: 'remote,hybrid',
        stack: ['React', 'node'],
        postedWithinDays: '7',
        q: '  ',
      }),
    ).toEqual({
      limit: 30,
      workModel: ['remote', 'hybrid'],
      stack: ['react', 'node'],
      postedWithinDays: 7,
      q: undefined,
    });
  });
});

describe('triagem', () => {
  it('aceita status e motivo opcional', () => {
    expect(triageInputSchema.parse({ status: 'dismissed', reason: ' presencial ' })).toEqual({
      status: 'dismissed',
      reason: 'presencial',
    });
    expect(triageInputSchema.safeParse({ status: 'archived' }).success).toBe(false);
  });

  it('lote exige ao menos um id e respeita o teto', () => {
    expect(bulkTriageInputSchema.safeParse({ ids: [], status: 'saved' }).success).toBe(false);
    const ids = Array.from({ length: 201 }, (_, i) => `id${i}`);
    expect(bulkTriageInputSchema.safeParse({ ids, status: 'saved' }).success).toBe(false);
  });

  it('filtro de triagem na listagem', () => {
    expect(jobListQuerySchema.parse({ triage: 'dismissed' }).triage).toEqual(['dismissed']);
  });
});
