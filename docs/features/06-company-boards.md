# 06 — Boards de empresa: Greenhouse, Lever e Ashby

Fontes do tipo `company-board`: em vez de buscar um termo no acervo inteiro
(Gupy), leem o board **de uma empresa por vez**. Volume menor, precisão alta e
APIs públicas, oficiais e estáveis.

Três fontes, **uma pasta cada** (`greenhouse/`, `lever/`, `ashby/`), no mesmo
molde da Gupy. O que é comum às três fica em `core/boards/`.

## Decisões

- **Empresas no `.env`, por fonte:** `GREENHOUSE_COMPANIES`,
  `LEVER_COMPANIES`, `ASHBY_COMPANIES`. Lista vazia = fonte inativa (não é
  agendada, não gera execução vazia a cada 6 h). Na Fase 2 a lista vai para o
  banco, com a tela de "empresas acompanhadas".
- **Só vagas de tecnologia:** filtro por palavras no título, em PT e EN
  (developer, engineer, desenvolvedor, software, frontend, QA...). Os
  `DISCOVERY_TERMS` da Gupy não servem aqui — "desenvolvedor" não casa com
  "Software Engineer". Lista configurável.
- **Só Brasil + remotas abertas:** mantém vaga no Brasil, remota sem
  restrição de país ou para LATAM/Américas, e vaga sem local informado.
  Descarta "Remote - US", "London" etc.
- **Filtrado ≠ descartado.** `dropped` continua significando "item fora do
  formato" (sinal de que o site mudou). Vaga válida que caiu nos filtros vai
  para um contador novo, `filtered`, em `SourceRun`. Senão o board do Nubank,
  com 300 vagas e 40 de tecnologia, pareceria uma fonte quebrada.
- **Sem fixture real:** o ambiente do assistente não alcança essas APIs. As
  fixtures são montadas a partir da documentação oficial; o `try` grava as
  reais na máquina do usuário, como na Gupy.

## Lista de empresas

```
GREENHOUSE_COMPANIES=zenvia,outra-empresa=Outra Empresa S.A.
```

`slug` ou `slug=Nome exibido`. O slug é o final da URL do board:

| ATS        | URL do board                      | Slug     |
| ---------- | --------------------------------- | -------- |
| Greenhouse | `job-boards.greenhouse.io/<slug>` | `<slug>` |
| Lever      | `jobs.lever.co/<slug>`            | `<slug>` |
| Ashby      | `jobs.ashbyhq.com/<slug>`         | `<slug>` |

O nome exibido é opcional: o Greenhouse informa o nome da empresa; Lever e
Ashby não, e aí o slug vira nome ("quinto-andar" → "Quinto Andar").

**Conferir um slug** (quantas vagas, quantas passaram nos filtros):

```bash
pnpm --filter @busca-vagas/sources try greenhouse zenvia
pnpm --filter @busca-vagas/sources try lever empresa-a empresa-b --no-filter
```

Nas fontes `company-board`, os argumentos depois do id são empresas (nas
`search`, continuam sendo termos).

## Comum às três (`core/boards/`)

| Arquivo           | Papel                                                                  |
| ----------------- | ---------------------------------------------------------------------- |
| `companies.ts`    | lê `slug[=Nome]` do `.env`; nome a partir do slug                      |
| `title-filter.ts` | "é vaga de tecnologia?" pelo título                                    |
| `place.ts`        | classifica o local: `brazil`, `remote-open`, `foreign`, `unknown`      |
| `filters.ts`      | configuração `BOARDS_*` e aplicação dos dois filtros                   |
| `per-company.ts`  | loop por empresa: pausa, empresa inexistente, dedup, falha só se todas |

**Loop por empresa:** empresa com 404 vira um aviso no log ("slug não
existe no Lever?") e as outras seguem. A fonte só falha se **todas** as
empresas falharem — mesma regra dos termos da Gupy.

**Local** — cada vaga tem uma ou mais localizações (texto + país, quando a
API informa) e às vezes um "é remota". Regras, por localização:

1. Cita Brasil (país `BR`, "Brasil/Brazil" ou uma capital/cidade grande) → `brazil`
2. Remota sem país, ou com "LATAM", "Latin America", "Americas", "Anywhere",
   "Worldwide" → `remote-open`
3. Remota com outro país ("Remote - US", endereço nos EUA) → `foreign`
4. Sem nenhum dado → `unknown`
5. Resto → `foreign`

Vaga com várias localizações fica com a melhor. `BOARDS_LOCATION=br-remote`
(padrão) mantém `brazil`, `remote-open` e `unknown`; `br` mantém `brazil` e
`unknown`; `any` desliga.

## Greenhouse

- `GET https://boards-api.greenhouse.io/v1/boards/<slug>/jobs?content=true`
- Uma requisição por empresa, sem paginação.
- `content` vem com o HTML **escapado** (`&lt;p&gt;`): decodifica e depois
  converte para texto.
- `absolute_url` pode apontar para o site da própria empresa
  (`?gh_jid=123`); `gh_jid` identifica a vaga e é mantido na URL canônica.
- Data: `first_published`. `updated_at` é data de edição — não serve.
- Modalidade só pelo texto do local ("Remote", "Híbrido"); contrato não informado.

## Lever

- `GET https://api.lever.co/v0/postings/<slug>?mode=json`
- `workplaceType` (`remote`, `hybrid`, `on-site`, `unspecified`), `country`
  (ISO), `categories.allLocations`, `categories.commitment`.
- Descrição = `description` + `lists` (requisitos etc.) + `additional`.
- Salário: `salaryRange` (`per-year-salary`, `per-month-salary`, `per-hour-wage`).
- Data: `createdAt` (milissegundos).
- Boards hospedados na UE (`api.eu.lever.co`) ficam para depois.

## Ashby

- `GET https://api.ashbyhq.com/posting-api/job-board/<slug>?includeCompensation=true`
- `workplaceType` (`OnSite`, `Remote`, `Hybrid`), `isRemote`,
  `employmentType` (`FullTime`, `Intern`, `Contract`...), endereço com país,
  `secondaryLocations`.
- Salário: `compensation.summaryComponents` do tipo `Salary`.
- `isListed: false` → descartada.

## Contrato

Jornada não é regime: "Full-time" de empresa estrangeira pode ser CLT, PJ ou
contractor. Por isso:

| Informação da vaga                | `contractType` |
| --------------------------------- | -------------- |
| Intern / estágio                  | `internship`   |
| Temporary / temporário            | `temporary`    |
| CLT / efetivo                     | `clt`          |
| PJ / pessoa jurídica              | `pj`           |
| Contract / contractor / freelance | `other`        |
| Full-time, part-time, nada        | `null`         |

## Mudanças fora das pastas das fontes

- `SourceResult.filtered` (opcional) e `SourceOutcome.filtered`.
- `SourceDefinition.inactiveReason(config)` (opcional): `buildSources` deixa
  a fonte de fora e explica o motivo ("GREENHOUSE_COMPANIES vazio").
- `SourceRun.filtered` (migration nova) e `SourceRunDto.filtered`.
- Cliente HTTP: teto de resposta sobe de 4 MB para 16 MB (board grande do
  Greenhouse com descrições passa de 4 MB).
- `try`: empresas como argumentos e `--no-filter`.

## Configuração (`.env`)

| Variável                   | Padrão         |                                                      |
| -------------------------- | -------------- | ---------------------------------------------------- |
| `GREENHOUSE_COMPANIES`     | (vazio)        | `slug[=Nome]`, separados por vírgula                 |
| `LEVER_COMPANIES`          | (vazio)        | idem                                                 |
| `ASHBY_COMPANIES`          | (vazio)        | idem                                                 |
| `<FONTE>_REQUEST_DELAY_MS` | `300`          | pausa entre empresas                                 |
| `BOARDS_TITLE_KEYWORDS`    | (lista padrão) | substitui a lista de palavras de tecnologia          |
| `BOARDS_TITLE_EXCLUDE`     | (lista padrão) | substitui a lista de exclusões ("sales engineer"...) |
| `BOARDS_LOCATION`          | `br-remote`    | `br-remote`, `br` ou `any`                           |

## Testes

- Unit (sem rede): lista de empresas; filtro de título (PT/EN, exclusões,
  lista customizada); classificação de local (tabela de casos); loop por
  empresa (404 segue, todas falhando lança, dedup, pausa).
- Por fonte: mapper item a item, contrato, salário, modalidade, URL; fetch
  com http falso contando `filtered` e `dropped`; config; teste com a
  resposta real quando houver `live-page.json`.
- Registro: fonte sem empresas fica inativa com motivo.
- Integração: `SourceRun.filtered` gravado e devolvido em `/discovery/runs`.
