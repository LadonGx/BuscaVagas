import { describe, expect, it } from 'vitest';
import {
  addCompanyInputSchema,
  checkCompanyInputSchema,
  updateCompanyInputSchema,
} from './companies';

describe('empresas acompanhadas', () => {
  it('aceita o link OU a fonte e o slug', () => {
    expect(addCompanyInputSchema.parse({ url: ' https://jobs.lever.co/acme ' })).toEqual({
      url: 'https://jobs.lever.co/acme',
    });
    expect(
      addCompanyInputSchema.parse({ source: 'greenhouse', slug: 'acme', name: ' Acme ' }),
    ).toEqual({ source: 'greenhouse', slug: 'acme', name: 'Acme' });
    expect(checkCompanyInputSchema.safeParse({ slug: 'acme' }).success).toBe(false);
    expect(checkCompanyInputSchema.safeParse({}).success).toBe(false);
  });

  it('slug no formato do board', () => {
    expect(addCompanyInputSchema.safeParse({ source: 'lever', slug: 'kraken.com' }).success).toBe(
      true,
    );
    expect(addCompanyInputSchema.safeParse({ source: 'lever', slug: 'a b' }).success).toBe(false);
    expect(addCompanyInputSchema.safeParse({ source: 'lever', slug: '-acme' }).success).toBe(false);
  });

  it('alterar pede ao menos um campo; nome null volta ao automático', () => {
    expect(updateCompanyInputSchema.safeParse({}).success).toBe(false);
    expect(updateCompanyInputSchema.parse({ name: null })).toEqual({ name: null });
    expect(updateCompanyInputSchema.parse({ active: false })).toEqual({ active: false });
  });
});
