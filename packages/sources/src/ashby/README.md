# Fonte: Ashby

Board de empresa (`company-board`): lê as vagas de cada empresa da lista
`ASHBY_COMPANIES`. API pública e oficial, sem autenticação.

## Endpoint

```
GET https://api.ashbyhq.com/posting-api/job-board/<slug>?includeCompensation=true
```

Documentação: <https://developers.ashbyhq.com/docs/public-job-posting-api>.
Uma requisição por empresa, sem paginação. Resposta: `{ apiVersion, jobs: [...] }`.

**Achar o slug:** final da URL `jobs.ashbyhq.com/<slug>` (respeite
maiúsculas, se houver).

## Manias conhecidas

| Comportamento                                                               | O que fazemos                                                                      |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Não informa o nome da empresa                                               | `ASHBY_COMPANIES=slug=Nome`, senão vem do slug                                     |
| `workplaceType`: `OnSite`, `Remote`, `Hybrid`; às vezes só `isRemote`       | campo próprio, depois `isRemote`, depois o texto                                   |
| `employmentType`: `FullTime`, `PartTime`, `Intern`, `Contract`, `Temporary` | `Intern` → estágio, `Temporary` → temporário, `Contract` → outro; jornada → `null` |
| País no endereço: `address.postalAddress.addressCountry` (nome, não ISO)    | entra no filtro de local                                                           |
| `secondaryLocations` com outros locais (endereço sem `postalAddress`)       | entram no filtro; vaga fica com o melhor local                                     |
| Remuneração em `compensation.summaryComponents`, com equity e bônus juntos  | só o componente `Salary`                                                           |
| `isListed: false`                                                           | descartada                                                                         |

Ainda não confirmado com resposta real: o status de um slug inexistente.

## Configuração (`.env`)

| Variável                 | Padrão  |                                               |
| ------------------------ | ------- | --------------------------------------------- |
| `ASHBY_COMPANIES`        | (vazio) | `slug[=Nome]`, vírgula; vazio = fonte inativa |
| `ASHBY_REQUEST_DELAY_MS` | `300`   | pausa entre empresas                          |

Filtros comuns (`BOARDS_*`): ver
[docs/features/06-company-boards.md](../../../../docs/features/06-company-boards.md).

## Quando quebrar

`pnpm --filter @busca-vagas/sources try ashby <slug> [--no-filter] [--save-fixture]`,
compare `__fixtures__/live-page.json` com `ashby.schema.ts`, ajuste e rode os testes.
