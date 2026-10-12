import type {
  AddCompanyResultDto,
  CompanyCheckDto,
  CompanyDirectoryDto,
  JobPosting,
  TrackedCompanyDto,
} from '@busca-vagas/shared';
import {
  AllCompaniesFailedError,
  resolveQueryCompanies,
  type CompanyScanStat,
  type HttpClient,
  type JobSource,
} from '@busca-vagas/sources';
import { Module } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestApp, describeDb, resetDatabase, type TestApp } from '../../../../test/helpers';
import { JobsModule } from '../../jobs/jobs.module';
import { SOURCE_HTTP_CLIENT, SOURCES } from '../discovery.constants';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { COMPANY_DIRECTORY } from './company-directory';
import { TrackedCompaniesStore } from './tracked-companies.store';

/* ------------------------------------------------------- board falso */

const posting = (slug: string, n: number): JobPosting => ({
  source: 'greenhouse',
  externalId: `${slug}-${n}`,
  url: `https://job-boards.greenhouse.io/${slug}/jobs/${n}`,
  title: `Desenvolvedor ${n}`,
  company: 'Acme Tecnologia',
  description: null,
  location: 'São Paulo',
  workModel: 'remote',
  contractType: 'clt',
  seniority: 'junior',
  stack: [],
  salary: null,
  postedAt: null,
});

/** Boards que "existem": slug → vagas que passam nos filtros (de 5 no board). */
const boards: Record<string, number> = { acme: 2, vazia: 0 };

/** Greenhouse falso com o mesmo comportamento do real: 404 lança com o resultado por empresa. */
const greenhouse: JobSource = {
  id: 'greenhouse',
  displayName: 'Greenhouse',
  kind: 'company-board',
  fetch: async (query) => {
    const companies = resolveQueryCompanies(query.companies) ?? [];
    const stats: CompanyScanStat[] = [];
    const jobs: JobPosting[] = [];
    for (const company of companies) {
      const kept = boards[company.slug.toLowerCase()];
      if (kept === undefined) {
        stats.push({
          slug: company.slug,
          status: 'not_found',
          jobs: 0,
          kept: 0,
          error: 'HTTP 404',
        });
        continue;
      }
      stats.push({ slug: company.slug, status: 'ok', jobs: 5, kept, error: null });
      jobs.push(...Array.from({ length: kept }, (_, i) => posting(company.slug, i + 1)));
    }
    if (stats.every((stat) => stat.status !== 'ok')) {
      throw new AllCompaniesFailedError('HTTP 404', stats);
    }
    return { jobs, dropped: 0, filtered: 0, companies: stats };
  },
};

const gupy: JobSource = {
  id: 'gupy',
  displayName: 'Gupy',
  kind: 'search',
  fetch: async () => ({ jobs: [], dropped: 0 }),
};

const http: HttpClient = { getJson: async () => ({}), getText: async () => '' };

@Module({
  imports: [JobsModule],
  controllers: [CompaniesController],
  providers: [
    CompaniesService,
    TrackedCompaniesStore,
    { provide: SOURCES, useValue: [gupy, greenhouse] },
    { provide: SOURCE_HTTP_CLIENT, useValue: http },
  ],
})
class CompaniesTestModule {}

describeDb('Empresas acompanhadas (integração)', () => {
  let t: TestApp;
  let store: TrackedCompaniesStore;

  beforeAll(async () => {
    t = await createTestApp([CompaniesTestModule]);
    store = t.app.get(TrackedCompaniesStore);
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });

  const api = () => request(t.http);

  it('adiciona pelo link: confere o board, guarda o resultado e já grava as vagas', async () => {
    const added = (
      await api()
        .post('/api/companies')
        .send({ url: 'https://job-boards.greenhouse.io/acme/jobs/123' })
        .expect(201)
    ).body as AddCompanyResultDto;

    expect(added.jobsNew).toBe(2);
    expect(added.company).toMatchObject({
      source: 'greenhouse',
      slug: 'acme',
      // Sem nome escolhido: o que veio da API do board.
      name: 'Acme Tecnologia',
      displayName: 'Acme Tecnologia',
      active: true,
      boardUrl: 'https://job-boards.greenhouse.io/acme',
      lastStatus: 'ok',
      lastJobs: 5,
      lastMatched: 2,
      lastError: null,
    });
    expect(added.company.lastCheckedAt).not.toBeNull();
    expect(await t.prisma.job.count({ where: { source: 'greenhouse' } })).toBe(2);

    const list = (await api().get('/api/companies').expect(200)).body as TrackedCompanyDto[];
    expect(list.map((company) => company.slug)).toEqual(['acme']);
  });

  it('adiciona por fonte + slug, com nome escolhido; board sem vagas hoje também entra', async () => {
    const added = (
      await api()
        .post('/api/companies')
        .send({ source: 'greenhouse', slug: 'vazia', name: 'Vazia S.A.' })
        .expect(201)
    ).body as AddCompanyResultDto;
    expect(added).toMatchObject({
      jobsNew: 0,
      company: { name: 'Vazia S.A.', lastMatched: 0 },
    });
  });

  it('não adiciona slug inexistente, repetido (sem diferenciar maiúsculas) nem link desconhecido', async () => {
    const missing = await api()
      .post('/api/companies')
      .send({ source: 'greenhouse', slug: 'nao-existe' })
      .expect(400);
    expect(missing.body.message).toMatch(/Não encontrei o board "nao-existe" no Greenhouse/);

    await api().post('/api/companies').send({ source: 'greenhouse', slug: 'acme' }).expect(201);
    const repeated = await api()
      .post('/api/companies')
      .send({ url: 'boards.greenhouse.io/ACME' })
      .expect(409);
    expect(repeated.body.message).toMatch(/já está na lista do Greenhouse/);

    const linkedin = await api()
      .post('/api/companies')
      .send({ url: 'https://www.linkedin.com/company/acme' })
      .expect(400);
    expect(linkedin.body.message).toMatch(/Não reconheci o link/);

    // Lever não está ativo neste teste; Gupy não é board de empresa.
    await api().post('/api/companies').send({ url: 'https://jobs.lever.co/acme' }).expect(400);
    await api().post('/api/companies').send({ source: 'gupy', slug: 'acme' }).expect(400);

    // Validação: precisa do link ou de fonte + slug.
    await api().post('/api/companies').send({ slug: 'acme' }).expect(400);
    await api().post('/api/companies').send({ source: 'greenhouse', slug: 'a b' }).expect(400);
  });

  it('conferir não grava nada e diz se já está na lista', async () => {
    const before = (
      await api().post('/api/companies/check').send({ url: 'jobs.ashbyhq.com/x' }).expect(400)
    ).body;
    expect(before.message).toMatch(/não é um board de empresa ativo/);

    const check = (
      await api()
        .post('/api/companies/check')
        .send({ source: 'greenhouse', slug: 'acme' })
        .expect(200)
    ).body as CompanyCheckDto;
    expect(check).toEqual({
      source: 'greenhouse',
      slug: 'acme',
      status: 'ok',
      jobs: 5,
      matched: 2,
      error: null,
      boardUrl: 'https://job-boards.greenhouse.io/acme',
      trackedId: null,
    });
    expect(await t.prisma.trackedCompany.count()).toBe(0);
    expect(await t.prisma.job.count()).toBe(0);

    const missing = (
      await api()
        .post('/api/companies/check')
        .send({ source: 'greenhouse', slug: 'sumiu' })
        .expect(200)
    ).body as CompanyCheckDto;
    expect(missing).toMatchObject({ status: 'not_found', error: 'HTTP 404' });
  });

  it('liga/desliga, renomeia, confere de novo e remove', async () => {
    const { company } = (
      await api().post('/api/companies').send({ source: 'greenhouse', slug: 'acme' }).expect(201)
    ).body as AddCompanyResultDto;

    const off = (
      await api().patch(`/api/companies/${company.id}`).send({ active: false }).expect(200)
    ).body as TrackedCompanyDto;
    expect(off.active).toBe(false);
    expect(await store.activeFor('greenhouse')).toEqual([]);

    const renamed = (
      await api().patch(`/api/companies/${company.id}`).send({ name: null }).expect(200)
    ).body as TrackedCompanyDto;
    expect(renamed).toMatchObject({ name: null, displayName: 'Acme' });
    await api().patch(`/api/companies/${company.id}`).send({}).expect(400);

    boards.acme = 3;
    const rechecked = (await api().post(`/api/companies/${company.id}/check`).expect(200))
      .body as TrackedCompanyDto;
    expect(rechecked.lastMatched).toBe(3);
    boards.acme = 2;

    await api().delete(`/api/companies/${company.id}`).expect(204);
    await api().delete(`/api/companies/${company.id}`).expect(404);
    await api().patch(`/api/companies/${company.id}`).send({ active: true }).expect(404);
  });

  it('diretório: só fontes ativas, marcando as que já estão na lista', async () => {
    await api().post('/api/companies').send({ source: 'greenhouse', slug: 'acme' }).expect(201);
    const inDirectory = COMPANY_DIRECTORY.find((entry) => entry.source === 'greenhouse')!;
    await t.prisma.trackedCompany.create({
      data: { source: 'greenhouse', slug: inDirectory.slug.toUpperCase() },
    });

    const directory = (await api().get('/api/companies/directory').expect(200))
      .body as CompanyDirectoryDto;
    expect(directory.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(directory.companies.length).toBeGreaterThan(5);
    expect(directory.companies.every((entry) => entry.source === 'greenhouse')).toBe(true);
    const tracked = directory.companies.filter((entry) => entry.trackedId);
    expect(tracked.map((entry) => entry.slug)).toEqual([inDirectory.slug]);
    expect(tracked[0]?.boardUrl).toBe(`https://job-boards.greenhouse.io/${inDirectory.slug}`);
  });

  it('importa as empresas do .env uma vez só; apagar depois não traz de volta', async () => {
    const seeds = [
      {
        sourceId: 'greenhouse',
        companies: [
          { slug: 'acme', name: 'Acme' },
          { slug: 'beta', name: null },
        ],
      },
      { sourceId: 'lever', companies: [{ slug: 'gama', name: null }] },
    ];

    expect(await store.importSeedsOnce(seeds)).toBe(3);
    await t.prisma.trackedCompany.deleteMany({ where: { slug: 'beta' } });
    expect(await store.importSeedsOnce(seeds)).toBeNull();

    expect(await store.activeFor('greenhouse')).toEqual([{ slug: 'acme', name: 'Acme' }]);
    expect(await store.activeCounts()).toEqual(
      new Map([
        ['greenhouse', 1],
        ['lever', 1],
      ]),
    );
  });
});
