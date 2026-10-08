import { describe, expect, it } from 'vitest';
import { jobPostingSchema, type JobPosting } from './job-posting';

const valid: JobPosting = {
  source: 'example',
  externalId: '42',
  url: 'https://jobs.example.com/42',
  title: 'Desenvolvedor Full Stack Júnior',
  company: 'Empresa Exemplo',
  description: null,
  location: 'Campinas, SP',
  workModel: 'hybrid',
  contractType: 'clt',
  seniority: 'junior',
  stack: ['typescript', 'nestjs'],
  salary: null,
  postedAt: '2026-10-01T12:00:00.000Z',
};

describe('jobPostingSchema', () => {
  it('aceita uma vaga completa', () => {
    expect(jobPostingSchema.parse(valid)).toEqual(valid);
  });

  it('recusa URL inválida', () => {
    expect(jobPostingSchema.safeParse({ ...valid, url: 'not-a-url' }).success).toBe(false);
  });

  it('recusa modalidade fora do enum', () => {
    expect(jobPostingSchema.safeParse({ ...valid, workModel: 'anywhere' }).success).toBe(false);
  });
});
