/**
 * Recalcula a nota de todas as vagas (`POST /api/preferences/rescore`).
 *
 * Para quando a regra da nota muda no código (pesos, critérios) sem mudar as
 * preferências — salvar as preferências já recalcula sozinho. Não tem botão
 * na tela porque as regras ainda não são editáveis por lá.
 *
 * Uso, com a API rodando: `pnpm scores:rescore`
 */

try {
  process.loadEnvFile('.env');
} catch {
  // Sem .env: usa o padrão abaixo.
}

const host = process.env.API_HOST || '127.0.0.1';
const port = process.env.API_PORT || '3333';
const url = `http://${host}:${port}/api/preferences/rescore`;

try {
  const response = await fetch(url, { method: 'POST' });
  if (!response.ok) {
    console.error(`A API respondeu ${response.status} em ${url}.`);
    process.exit(1);
  }
  const { queued } = await response.json();
  console.log(
    queued
      ? 'Recálculo na fila: as notas são refeitas em segundo plano (acompanhe no terminal da API).'
      : 'As notas foram invalidadas, mas a fila não respondeu (Redis fora do ar?). Elas são recalculadas quando a fila voltar.',
  );
} catch {
  console.error(`Não consegui falar com a API em ${url}. Ela está rodando (pnpm dev:api)?`);
  process.exit(1);
}
