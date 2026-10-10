# Fonte: Greenhouse

Board de empresa (`company-board`): lê as vagas de cada empresa da lista
`GREENHOUSE_COMPANIES`. API pública e oficial, sem autenticação.

## Endpoint

```
GET https://boards-api.greenhouse.io/v1/boards/<slug>/jobs?content=true
```

Documentação: <https://developers.greenhouse.io/job-board.html>. Uma
requisição por empresa, sem paginação. Resposta: `{ jobs: [...], meta: { total } }`.

**Achar o slug:** é o final da URL do board,
`job-boards.greenhouse.io/<slug>` (ou `boards.greenhouse.io/<slug>`). Em site
próprio da empresa, procure `gh_jid=` nos links das vagas ou
`greenhouse.io/<slug>` no código da página.

## Manias conhecidas

| Comportamento                                                | O que fazemos                                |
| ------------------------------------------------------------ | -------------------------------------------- |
| `content` vem com o HTML **escapado** (`&lt;p&gt;`)          | decodifica e converte para texto             |
| `absolute_url` pode ser o site da empresa (`...?gh_jid=123`) | aceito; `gh_jid` fica, `gh_src` sai          |
| `updated_at` é data de **edição**                            | usa `first_published`; sem ele, data `null`  |
| Sem campo de modalidade                                      | pelo texto do local ("Remote", "Híbrido")    |
| Sem campo de contrato                                        | `null`                                       |
| `company_name` em cada vaga                                  | usado, a menos que o `.env` dê outro nome    |
| `offices` lista escritórios com cidade e país                | entram como locais extras no filtro de local |
| Board grande com descrições passa de 4 MB                    | teto do cliente HTTP é 16 MB                 |

Ainda não confirmado com resposta real (o ambiente de desenvolvimento não
alcança a API): se `first_published` e `company_name` vêm na listagem. Ambos
são tratados como opcionais.

## Configuração (`.env`)

| Variável                      | Padrão  |                                               |
| ----------------------------- | ------- | --------------------------------------------- |
| `GREENHOUSE_COMPANIES`        | (vazio) | `slug[=Nome]`, vírgula; vazio = fonte inativa |
| `GREENHOUSE_REQUEST_DELAY_MS` | `300`   | pausa entre empresas                          |

Filtros comuns a todos os boards (`BOARDS_*`): ver
[docs/features/06-company-boards.md](../../../../docs/features/06-company-boards.md).

## Quando quebrar

1. `pnpm --filter @busca-vagas/sources try greenhouse <slug>` — mostra por
   empresa quantas vagas vieram, ficaram, foram filtradas e descartadas.
2. `--no-filter` para ver tudo; `--save-fixture` grava a resposta real em
   `__fixtures__/live-page.json`, que os testes passam a validar.
3. Ajuste schema/mapper e rode `pnpm --filter @busca-vagas/sources test`.
