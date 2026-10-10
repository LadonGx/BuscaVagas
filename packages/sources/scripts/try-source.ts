/**
 * Roda uma fonte DE VERDADE, sem gravar nada no banco. É a primeira
 * ferramenta quando um site muda: mostra o que veio, o que foi descartado e o
 * erro, se houver.
 *
 *   pnpm --filter @busca-vagas/sources try gupy "desenvolvedor"
 *   pnpm --filter @busca-vagas/sources try gupy "node" "react" --save-fixture
 *
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
  const [sourceId, ...terms] = args.filter((arg) => !arg.startsWith('--'));

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

  console.log(
    `\n▶ ${source.displayName} — termos: ${terms.length ? terms.join(', ') : '(padrão)'}\n`,
  );
  const { jobs, outcome } = await runSource(source, { terms }, http, (message) =>
    console.log(`  [log] ${message}`),
  );

  console.log(`\nStatus: ${outcome.status}  ·  ${outcome.durationMs} ms`);
  console.log(`Vagas válidas: ${outcome.jobs}  ·  descartadas: ${outcome.dropped}`);
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

  // Corta a lista para a fixture ficar pequena e legível no git.
  const trimmed =
    response && typeof response === 'object' && Array.isArray((response as { data?: unknown }).data)
      ? {
          ...(response as object),
          data: (response as { data: unknown[] }).data.slice(0, FIXTURE_MAX_ITEMS),
        }
      : response;

  const path = join(SRC_DIR, sourceId, '__fixtures__', 'live-page.json');
  writeFileSync(path, `${JSON.stringify(trimmed, null, 2)}\n`);
  console.log(`\nFixture gravada: ${path}`);
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
