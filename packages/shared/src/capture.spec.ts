import { describe, expect, it } from 'vitest';
import { isRestrictedUrl, siteJobUrl } from './capture';

describe('isRestrictedUrl', () => {
  it.each([
    'https://www.linkedin.com/jobs/view/1',
    'https://br.indeed.com/viewjob?jk=a1',
    'https://www.glassdoor.com.br/job-listing/j?jl=1',
    'https://www.infojobs.com.br/vaga-de-x.aspx',
    'https://www.vagas.com.br/vagas/v1',
    // Ponto final no host, encurtador e domínios de outros países.
    'https://www.linkedin.com./jobs/view/1',
    'https://WWW.LinkedIn.com/jobs/view/1',
    'https://lnkd.in/abc123',
    'https://www.glassdoor.co.uk/job-listing/j?jl=1',
    'https://www.glassdoor.ca/x',
    'https://indeed.com.br/viewjob?jk=a1',
    'https://de.indeed.com/viewjob?jk=a1',
    'https://www.indeed.co.uk/viewjob?jk=a1',
    'https://www.indeed.de/viewjob?jk=a1',
    'https://engage.indeed.com/f/a/xyz',
    'https://vagas.com/vagas/v1',
    'https://vagas.com.br/vagas/v1',
    'https://www.infojobs.net/oferta',
    'https://www.infojobs.it/oferta',
  ])('restrito: %s', (url) => expect(isRestrictedUrl(url)).toBe(true));

  it.each([
    'https://acme.gupy.io/jobs/1',
    'https://notlinkedin.com/x',
    'https://linkedin.acme.io/x',
    'https://indeed.example.com/x',
    'https://vagas.empresa.com.br/dev',
    'https://empresa.com.br/vagas/1',
    'não é link',
  ])('livre: %s', (url) => expect(isRestrictedUrl(url)).toBe(false));
});

describe('siteJobUrl', () => {
  it('LinkedIn: vaga aberta direto, com nome no link ou na lista', () => {
    for (const url of [
      'https://www.linkedin.com/jobs/view/4476236394/?refId=x&trackingId=y',
      'https://br.linkedin.com/jobs/view/desenvolvedor-junior-at-wevy-4476236394',
      'https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4476236394',
      'https://www.linkedin.com/jobs/search/?currentJobId=4476236394&keywords=dev',
    ]) {
      expect(siteJobUrl(url)).toBe('https://www.linkedin.com/jobs/view/4476236394');
    }
  });

  it('Glassdoor e Indeed: o id da vaga', () => {
    expect(
      siteJobUrl(
        'https://www.glassdoor.com.br/job-listing/dev-acme-JV_IC1_KO0,3_KE4,8.htm?jl=1010291473383&pos=101',
      ),
    ).toBe('https://www.glassdoor.com.br/job-listing/j?jl=1010291473383');
    expect(siteJobUrl('https://br.indeed.com/jobs?q=dev&vjk=abc123')).toBe(
      'https://br.indeed.com/viewjob?jk=abc123',
    );
  });

  it('host com ponto final e de outros países', () => {
    expect(siteJobUrl('https://www.linkedin.com./jobs/view/4476236394/')).toBe(
      'https://www.linkedin.com/jobs/view/4476236394',
    );
    expect(siteJobUrl('https://www.glassdoor.co.uk/job-listing/x.htm?jl=123')).toBe(
      'https://www.glassdoor.co.uk/job-listing/j?jl=123',
    );
    expect(siteJobUrl('https://de.indeed.com./jobs?vjk=abc123')).toBe(
      'https://de.indeed.com/viewjob?jk=abc123',
    );
  });

  it('outros sites e LinkedIn sem vaga: como veio', () => {
    expect(siteJobUrl('https://acme.gupy.io/jobs/1?x=1')).toBe('https://acme.gupy.io/jobs/1?x=1');
    expect(siteJobUrl('https://www.linkedin.com/feed/')).toBe('https://www.linkedin.com/feed/');
  });
});
