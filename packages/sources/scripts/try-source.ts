/**
 * Roda uma fonte DE VERDADE, sem gravar nada no banco. É a primeira
 * ferramenta quando um site muda: mostra o que veio, o que foi descartado e o
 * erro, se houver.
 *
 *   pnpm --filter @busca-vagas/sources try gupy "desenvolvedor"
 *   pnpm --filter @busca-vagas/sources try gupy "node" "react" --save-fixture
 *   pnpm --filter @busca-vagas/sources try greenhouse minha-empresa outra-empresa
 *
 * Nas fontes `search` os argumentos são termos; nas `company-board`, slugs
 * de empresas (é assim que se confere se um slug existe).
 *
 * --no-filter     desliga os filtros da fonte (título, local) para ver tudo
 *                 o que o board tem.
 * --save-fixture  grava a primeira resposta real em
 *                 src/<fonte>/__fixtures__/live-page.json (até 30 itens), que
 *                 os testes da fonte passam a usar.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { JobPosting } from '@busca-vagas/shared';
import { createHttpClient, type HttpClient } from '../src/core/http';
import { runSource } from '../src/core/run-sources';
import { SOURCE_DEFINITIONS } from '../src/registry';

const FIXTURE_MAX_ITEMS = 30;
const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const saveFixture = args.includes('--save-fixture');
  const skipFilters = args.includes('--no-filter');
  const [sourceId, ...values] = args.filter((arg) => !arg.startsWith('--'));

  const definition = SOURCE_DEFINITIONS.find((item) => item.id === sourceId);
  if (!definition) {
    console.error(
      `Uso: pnpm --filter @busca-vagas/sources try <fonte> [termos...] [--save-fixture]\n` +
        `Fontes: ${SOURCE_DEFINITIONS.map((item) => item.id).join(', ')}`,
    );
    return 2;
  }

  const source = definition.create(definition.parseConfig(process.env));
  const responses: unknown[] = [];
  const base = createHttpClient();
  const http: HttpClient = {
    async getJson(url, options) {
      console.log(`  GET ${url}`);
      const body = await base.getJson(url, options);
      responses.push(body);
      return body;
    },
    getText: (url, options) => base.getText(url, options),
  };

  const byCompany = source.kind === 'company-board';
  if (byCompany && values.length === 0) {
    console.error(`Informe ao menos um slug: try ${source.id} <empresa> [outra-empresa...]`);
    return 2;
  }
  const query = byCompany ? { companies: values, skipFilters } : { terms: values, skipFilters };

  console.log(
    `\n▶ ${source.displayName} — ${byCompany ? 'empresas' : 'termos'}: ${values.length ? values.join(', ') : '(padrão)'}` +
      `${skipFilters ? '  (sem filtros)' : ''}\n`,
  );
  const { jobs, outcome } = await runSource(source, query, http, (message) =>
    console.log(`  [log] ${message}`),
  );

  console.log(`\nStatus: ${outcome.status}  ·  ${outcome.durationMs} ms`);
  console.log(
    `Vagas válidas: ${outcome.jobs}  ·  filtradas: ${outcome.filtered}  ·  descartadas: ${outcome.dropped}`,
  );
  if (outcome.error) {
    console.log(`Erro: ${outcome.error}`);
  }

  if (jobs.length > 0) {
    printSummary(jobs);
  }

  if (saveFixture) {
    saveFirstResponse(definition.id, responses[0]);
  }

  return outcome.status === 'ok' ? 0 : 1;
}

function printSummary(jobs: JobPosting[]): void {
  console.log('\nExemplos:');
  for (const job of jobs.slice(0, 5)) {
    console.log(`  • ${job.title} — ${job.company}`);
    console.log(
      `    ${[job.workModel, job.contractType, job.seniority, job.location].filter(Boolean).join(' · ') || '(sem detalhes)'}`,
    );
    if (job.stack.length) console.log(`    stack: ${job.stack.join(', ')}`);
    console.log(`    ${job.url}`);
  }

  console.log('\nCampos preenchidos (de', jobs.length, 'vagas):');
  for (const field of ['workModel', 'contractType', 'seniority', 'location', 'postedAt'] as const) {
    const filled = jobs.filter((job) => job[field] !== null).length;
    console.log(`  ${field.padEnd(13)} ${Math.round((filled / jobs.length) * 100)}%`);
  }
  const withStack = jobs.filter((job) => job.stack.length > 0).length;
  console.log(`  ${'stack'.padEnd(13)} ${Math.round((withStack / jobs.length) * 100)}%`);
}

function saveFirstResponse(sourceId: string, response: unknown): void {
  if (response === undefined) {
    console.log('\nNada para gravar: nenhuma resposta chegou.');
    return;
  }

  const trimmed = trimForFixture(response);

  const path = join(SRC_DIR, sourceId, '__fixtures__', 'live-page.json');
  writeFileSync(path, `${JSON.stringify(trimmed, null, 2)}\n`);
  console.log(`\nFixture gravada: ${path}`);
}

/**
 * Corta a lista para a fixture ficar pequena e legível no git. Entende os
 * envelopes das fontes atuais: `{ data: [...] }` (Gupy), `{ jobs: [...] }`
 * (Greenhouse, Ashby) e a lista pura (Lever).
 */
function trimForFixture(response: unknown): unknown {
  if (Array.isArray(response)) {
    return response.slice(0, FIXTURE_MAX_ITEMS);
  }
  if (response && typeof response === 'object') {
    const body = response as Record<string, unknown>;
    for (const key of ['data', 'jobs']) {
      const list = body[key];
      if (Array.isArray(list)) {
        return { ...body, [key]: list.slice(0, FIXTURE_MAX_ITEMS) };
      }
    }
  }
  return response;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
