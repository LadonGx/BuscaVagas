/**
 * Recalcula a nota de todas as vagas (`POST /api/preferences/rescore`).
 *
 * Para quando a regra da nota muda no código (pesos, critérios) sem mudar as
 * preferências — salvar as preferências já recalcula sozinho. Não tem botão
 * na tela porque as regras ainda não são editáveis por lá.
 *
 * Uso, com o app rodando (Docker ou dev): `pnpm scores:rescore`
 *
 * Onde procura o app, como o `pnpm candidatar`: `BUSCAVAGAS_URL`, depois
 * `API_HOST`/`API_PORT` do `.env`, depois 127.0.0.1:8080 (Docker) e
 * 127.0.0.1:3333 (dev).
 */

try {
  process.loadEnvFile('.env');
} catch {
  // Sem .env: usa os padrões abaixo.
}

const candidates = [
  process.env.BUSCAVAGAS_URL,
  process.env.API_HOST || process.env.API_PORT
    ? `http://${process.env.API_HOST || '127.0.0.1'}:${process.env.API_PORT || '3333'}`
    : null,
  'http://127.0.0.1:8080',
  'http://127.0.0.1:3333',
]
  .filter(Boolean)
  .map((base) => base.trim().replace(/\/+$/, ''));

/** O primeiro endereço que responde ao `/api/health` (503 = de pé, sem banco ou fila). */
async function findApp() {
  for (const base of [...new Set(candidates)]) {
    try {
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2_000) });
      const body = await response.json();
      if (typeof body?.status === 'string') return base;
    } catch {
      // Não respondeu: tenta o próximo.
    }
  }
  return null;
}

const base = await findApp();
if (!base) {
  console.error(
    `Não achei o app em ${candidates.join(', ')}. Ele está rodando (pnpm app:up ou pnpm dev:api)?`,
  );
  process.exit(1);
}

const url = `${base}/api/preferences/rescore`;
try {
  // A API exige `Content-Type: application/json` em todo POST, mesmo sem corpo.
  const response = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    console.error(`A API respondeu ${response.status} em ${url}.`);
    process.exit(1);
  }
  const { queued } = await response.json();
  console.log(
    queued
      ? 'Recálculo na fila: as notas são refeitas em segundo plano (acompanhe nos logs da API).'
      : 'As notas foram invalidadas, mas a fila não respondeu (Redis fora do ar?). Elas são recalculadas quando a fila voltar.',
  );
} catch {
  console.error(`Não consegui falar com a API em ${url}.`);
  process.exit(1);
}
