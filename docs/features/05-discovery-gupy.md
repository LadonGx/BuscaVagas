# 05 — Descoberta de vagas + fonte Gupy

Primeira fonte automática. Duas partes com responsabilidades separadas:

| Parte               | Onde                              | Sabe de...                                                  |
| ------------------- | --------------------------------- | ----------------------------------------------------------- |
| **Módulo da fonte** | `packages/sources/src/gupy/`      | só da Gupy: endpoint, formato, paginação, configuração      |
| **Descoberta**      | `apps/api/src/modules/discovery/` | rodar **qualquer** fonte: fila, agenda, histórico, gravação |

Consertar a Gupy nunca exige mexer na API; adicionar uma fonte nova também não.

## Decisões

- **Termos padrão:** `desenvolvedor, full stack, backend, frontend, node, react`
  (`DISCOVERY_TERMS` no `.env`). Cada termo é uma busca separada.
- **Duas formas de buscar:** automática a cada 6 horas enquanto a API estiver
  rodando (`DISCOVERY_INTERVAL_HOURS`, `0` desliga) **e** manual via
  `POST /api/discovery/scan`.
- **Sem fixture real no repositório por enquanto:** o ambiente de
  desenvolvimento do assistente não alcança a Gupy. A fixture foi montada a
  partir do formato documentado por outros projetos; o script `try` grava a
  real na primeira execução na máquina do usuário.

## Módulo de uma fonte

Cada fonte é uma pasta com a mesma forma:

| Arquivo                             | Papel                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `<fonte>.config.ts`                 | configuração própria, lida do `.env` com prefixo (`GUPY_*`), validada com Zod |
| `<fonte>.schema.ts`                 | formato da resposta do site (só os campos usados)                             |
| `<fonte>.mapper.ts`                 | item do site → `JobPosting`, ou `null` se não serve                           |
| `<fonte>.source.ts`                 | requisições, paginação, limites                                               |
| `index.ts`                          | `SourceDefinition`: id, nome, tipo, config e `create(config)`                 |
| `__fixtures__/` + `<fonte>.spec.ts` | testes sem rede                                                               |
| `README.md`                         | endpoint, limites e "manias" do site                                          |

O `registry.ts` só lista as definições. A API chama `buildSources(env)` e
recebe as fontes prontas e configuradas.

Heurísticas que valem para todas as fontes ficam em `core/normalize/`:
HTML → texto, senioridade pelo título e stack pelo texto.

## Gupy

- `GET https://portal.gupy.io/api/job-search/jobs?jobName=<termo>&offset=<n>&limit=100` (antes de out/2026: `employability-portal.gupy.io/api/v1/jobs`, hoje 404)
- Busca no **título** (`jobName`): termos juntos numa busca só quase não
  retornam nada — por isso uma busca por termo.
- **Fim da paginação = página incompleta.** O campo `pagination.total` não
  serve: devolve o tamanho da página, não do resultado.
- Teto `GUPY_MAX_PAGES` (padrão 3) por termo; 300 ms entre requisições.
- Descarta: banco de talentos, empresa confidencial, link fora de `https://*.gupy.io`,
  sem título ou empresa.
- Mapeia: `workplaceType` → modalidade; `type` → contrato (efetivo = CLT,
  pessoa jurídica = PJ, estágio, temporário; outros = `other`); descrição
  sem HTML; senioridade e stack pelas heurísticas.

## Descoberta na API

### Fluxo

```
POST /api/discovery/scan  ─┐
agenda (a cada 6h)        ─┴─► fila source-scan (1 job por fonte, dedup por fonte)
                                   │
                                   ▼
                     ScanRunner: SourceRun "running"
                       → runSource (prazo próprio, nunca lança)
                       → JobsService.ingest (dedup no banco, não sobrescreve edição)
                       → SourceRun "ok"/"failed" com contagens
                       → se falhou: lança para o BullMQ tentar de novo (3x, backoff)
```

- **Dedup na fila:** pedir de novo uma fonte que já está na fila (ou
  rodando) não cria outro job — volta em `alreadyQueued`.
- **Agenda sem rodar a cada restart:** o agendador só é criado/alterado
  quando a configuração muda. Reiniciar a API em modo dev (a cada arquivo
  salvo) não dispara uma busca nova. A primeira execução agendada acontece
  1 minuto depois de a agenda ser criada.

### `SourceRun` (histórico)

Novos campos: `jobsNew` (quantas eram novas no banco), `terms` (termos
usados) e `trigger` (`manual` ou `schedule`). `jobsFound` = vagas válidas que
a fonte devolveu; `dropped` = itens descartados pelo mapper. Um salto em
`dropped` é o primeiro sinal de que o site mudou.

### Rotas

| Método | Rota                     | Observação                                                                  |
| ------ | ------------------------ | --------------------------------------------------------------------------- |
| `GET`  | `/api/discovery/sources` | fontes, se estão ativas (senão, o motivo), última execução                  |
| `POST` | `/api/discovery/scan`    | `{ sources?, terms? }` → 202 `{ queued, alreadyQueued, inactive, unknown }` |
| `GET`  | `/api/discovery/runs`    | `?sourceId=&limit=&cursor=` — histórico paginado, mais recente primeiro     |
| `GET`  | `/api`                   | índice das rotas da API                                                     |

### Configuração (`.env`)

| Variável                   | Padrão                                                 |                           |
| -------------------------- | ------------------------------------------------------ | ------------------------- |
| `DISCOVERY_SOURCES`        | (todas)                                                | ids separados por vírgula |
| `DISCOVERY_TERMS`          | `desenvolvedor,full stack,backend,frontend,node,react` |                           |
| `DISCOVERY_INTERVAL_HOURS` | `6`                                                    | `0` desliga a agenda      |
| `GUPY_MAX_PAGES`           | `3`                                                    | páginas de 100 por termo  |

## Manutenção de uma fonte

```bash
pnpm --filter @busca-vagas/sources try gupy "desenvolvedor"
pnpm --filter @busca-vagas/sources try gupy "desenvolvedor" --save-fixture
```

Roda a fonte de verdade (sem gravar no banco) e mostra quantas vagas vieram,
quantas foram descartadas e exemplos. Com `--save-fixture`, grava a resposta
real em `__fixtures__/live-page.json`; a partir daí os testes da fonte também
validam o mapper contra dados reais.

## Testes

- Unit (sem rede): heurísticas; mapper da Gupy item a item; paginação (para
  em página incompleta, respeita o teto, uma busca por termo, dedup entre
  termos); resposta fora do formato encerra sem lançar; config do `.env`.
- Integração (Postgres real, fonte falsa): `ScanRunner` grava vagas e
  `SourceRun`, conta novas vs. já vistas, registra falha e relança;
  `GET /discovery/sources` e `/runs`.
- Unit: decisão do agendador (criar, manter, trocar, remover).
