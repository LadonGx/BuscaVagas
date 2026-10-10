# Fonte: Lever

Board de empresa (`company-board`): lê as vagas de cada empresa da lista
`LEVER_COMPANIES`. API pública e oficial, sem autenticação.

## Endpoint

```
GET https://api.lever.co/v0/postings/<slug>?mode=json
```

Documentação: <https://github.com/lever/postings-api>. Sem `limit`, devolve o
board inteiro numa requisição. Resposta: a **lista pura** de vagas.

**Achar o slug:** final da URL `jobs.lever.co/<slug>`.

## Manias conhecidas

| Comportamento                                                                      | O que fazemos                                   |
| ---------------------------------------------------------------------------------- | ----------------------------------------------- |
| Não informa o nome da empresa                                                      | `LEVER_COMPANIES=slug=Nome`, senão vem do slug  |
| `workplaceType`: `remote`, `hybrid`, `on-site`, `unspecified`                      | `unspecified` → modalidade pelo texto do local  |
| `categories.commitment` é jornada ("Full-time"), às vezes regime ("CLT", "Intern") | regime só quando explícito; full-time → `null`  |
| `country` (ISO) é um só, mesmo com vários locais em `allLocations`                 | todos os locais entram no filtro, com esse país |
| Descrição dividida em `description`, `lists` (requisitos...) e `additional`        | junta tudo, nessa ordem                         |
| `salaryRange.interval`: `per-year-salary`, `per-month-salary`, `per-hour-wage`...  | ano/mês/hora; outros intervalos → sem salário   |
| `createdAt` em milissegundos                                                       | vira a data de publicação                       |
| Boards hospedados na UE ficam em `api.eu.lever.co`                                 | ainda não suportado                             |

Ainda não confirmado com resposta real: o status de um slug inexistente
(tratado como falha da empresa, com aviso no log).

## Configuração (`.env`)

| Variável                 | Padrão  |                                               |
| ------------------------ | ------- | --------------------------------------------- |
| `LEVER_COMPANIES`        | (vazio) | `slug[=Nome]`, vírgula; vazio = fonte inativa |
| `LEVER_REQUEST_DELAY_MS` | `300`   | pausa entre empresas                          |

Filtros comuns (`BOARDS_*`): ver
[docs/features/06-company-boards.md](../../../../docs/features/06-company-boards.md).

## Quando quebrar

`pnpm --filter @busca-vagas/sources try lever <slug> [--no-filter] [--save-fixture]`,
compare `__fixtures__/live-page.json` com `lever.schema.ts`, ajuste e rode os testes.
