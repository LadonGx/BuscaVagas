# 06 — Boards de empresa: Greenhouse, Lever e Ashby

Fontes do tipo `company-board`: em vez de buscar um termo no acervo inteiro
(Gupy), leem o board **de uma empresa por vez**. Volume menor, precisão alta e
APIs públicas, oficiais e estáveis.

Três fontes, **uma pasta cada** (`greenhouse/`, `lever/`, `ashby/`), no mesmo
molde da Gupy. O que é comum às três fica em `core/boards/`.

## Decisões

- **Empresas no banco, editadas na tela** (desde a Fase 3): Preferências →
  Fontes → **Empresas acompanhadas**. Cada busca lê a lista na hora — sem
  reiniciar a API. Board sem empresas ligadas fica parado (não gera execução
  vazia) e a tela diz por quê. As listas do `.env` (`GREENHOUSE_COMPANIES`...)
  só **semeiam** o banco na primeira subida; ver "Empresas acompanhadas".
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

## Empresas acompanhadas

Tabela `TrackedCompany` (fonte + slug únicos, sem diferenciar maiúsculas na
checagem). Cada empresa pode ser **desligada** sem sair da lista e guarda o
resultado da última leitura: vagas no board, quantas passaram nos filtros,
`ok` / `not_found` (404: slug errado ou a empresa saiu do ATS) / `failed`.

**Na tela** (painel "Empresas acompanhadas"):

- **Adicionar pelo link** — cola a página de vagas (ou o link de uma vaga) no
  Greenhouse, Lever ou Ashby; a API descobre a fonte e o slug, **confere o
  board antes** (404 não entra) e já grava as vagas que vieram.
- **Minha lista** por board: liga/desliga, "ler o board agora", remover (com
  confirmação), link para o board, estado da última leitura.
- **Diretório**: empresas conferidas na API de cada ATS (brasileiras e de fora
  contratando remoto na América Latina), com busca e "Acompanhar". Fica em
  `apps/api/src/modules/discovery/companies/company-directory.ts`, com a data
  da conferência. Boards mudam: empresa que sair do ATS aparece como "não
  encontrada" na lista depois da primeira busca.

**API:**

| Rota                        | O que faz                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `GET /companies`            | a lista, por fonte e nome                                                             |
| `POST /companies`           | `{ url }` ou `{ source, slug, name? }`: confere, adiciona, grava as vagas (`jobsNew`) |
| `PATCH /companies/:id`      | `{ active?, name? }` (`name: null` = automático)                                      |
| `DELETE /companies/:id`     | remove                                                                                |
| `POST /companies/check`     | lê um board agora **sem gravar nada** (status, vagas, filtradas)                      |
| `POST /companies/:id/check` | lê o board de uma empresa da lista e guarda o resultado                               |
| `GET /companies/directory`  | o diretório, com `trackedId` nas que já estão na lista                                |

Links reconhecidos (`core/boards/board-url.ts`): `job-boards.greenhouse.io/<slug>`,
`boards.greenhouse.io/<slug>` (e `/embed/job_board?for=<slug>`), `jobs.lever.co/<slug>`,
`jobs.ashbyhq.com/<slug>` e os endereços das APIs. Boards da UE
(`*.eu.greenhouse.io`, `jobs.eu.lever.co`) ainda não.

**O `.env` agora só semeia.** Na primeira subida desta versão, as empresas de
`GREENHOUSE_COMPANIES`, `LEVER_COMPANIES` e `ASHBY_COMPANIES` são copiadas
para o banco **uma vez** (marca `companies:env-imported` em `SystemFlag`).
Depois disso a tela manda: apagar uma empresa não a traz de volta, e mudar o
`.env` não muda nada.

```
GREENHOUSE_COMPANIES=zenvia,outra-empresa=Outra Empresa S.A.
```

`slug` ou `slug=Nome exibido`. O slug é o final da URL do board:

| ATS        | URL do board                      | Slug     |
| ---------- | --------------------------------- | -------- |
| Greenhouse | `job-boards.greenhouse.io/<slug>` | `<slug>` |
| Lever      | `jobs.lever.co/<slug>`            | `<slug>` |
| Ashby      | `jobs.ashbyhq.com/<slug>`         | `<slug>` |

O nome exibido é opcional: o Greenhouse informa o nome da empresa (ao
adicionar pela tela, ele é guardado); Lever e Ashby não, e aí o slug vira
nome ("quinto-andar" → "Quinto Andar") — o diretório já traz o nome certo.

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
| `board-url.ts`    | link do board ↔ (fonte, slug); página pública do board                 |

**Loop por empresa:** empresa com 404 vira um aviso no log ("slug não
existe no Lever?") e as outras seguem. A fonte só falha se **todas** as
empresas falharem — mesma regra dos termos da Gupy. O resultado de cada
empresa volta em `SourceResult.companies` (também quando todas falham, via
`AllCompaniesFailedError`) e a API guarda em `TrackedCompany`.

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

## Fonte parada

Os três boards **sobem sempre** e ficam agendados. Sem empresa ligada:

- **`GET /api/discovery/sources`:** `active: false`, `trackedCompanies: 0` e o
  `reason` ("Nenhuma empresa acompanhada — adicione em Preferências → Fontes →
  Empresas"); a tela mostra "Parada · nenhuma empresa na lista".
- **`POST /api/discovery/scan`:** nada é enfileirado e a resposta traz
  `inactive: [{ sourceId, reason }]`.
- **Busca agendada:** o `ScanRunner` vê a lista vazia e não registra execução.
  Basta adicionar uma empresa para a próxima busca agendada já ler o board.

`.env` inválido (ex.: `GREENHOUSE_REQUEST_DELAY_MS=abc`) continua tirando a
fonte do ar, com o erro na subida e em `reason`.

## Mudanças fora das pastas das fontes

- `SourceResult.filtered` (opcional) e `SourceOutcome.filtered`.
- `SourceDefinition.inactiveReason(config)` (opcional): `buildSources` deixa
  a fonte de fora e explica o motivo ("GREENHOUSE_COMPANIES vazio").
- `SourceInfoDto.active`/`reason` e `ScanResultDto.inactive`.
- `SourceRun.filtered` (migration nova) e `SourceRunDto.filtered`.
- Cliente HTTP: teto de resposta sobe de 4 MB para 16 MB (board grande do
  Greenhouse com descrições passa de 4 MB).
- `try`: empresas como argumentos e `--no-filter`; mostra o resultado de cada empresa.
- Fase 3: `SourceQuery.companies` aceita empresas prontas (`{ slug, name }`);
  `SourceResult.companies` / `SourceOutcome.companies`; os boards não têm mais
  `inactiveReason`; `SourceInfoDto.trackedCompanies`; tabelas `TrackedCompany`
  e `SystemFlag` (migration `tracked_companies`).

## Configuração (`.env`)

| Variável                   | Padrão         |                                                      |
| -------------------------- | -------------- | ---------------------------------------------------- |
| `GREENHOUSE_COMPANIES`     | (vazio)        | `slug[=Nome]`, vírgula — só a 1ª subida (semente)    |
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
- Link do board: cada formato de URL reconhecido; o que não é board fica de fora.
- Registro: os boards sobem com o `.env` vazio.
- Integração: `SourceRun.filtered` gravado e devolvido em `/discovery/runs`;
  a busca usa as empresas ligadas do banco e guarda o resultado de cada uma;
  board sem empresas não busca nem registra execução; `/companies` (adicionar
  pelo link, 404 não entra, repetida = 409, conferir sem gravar, ligar/desligar,
  remover, diretório); importação do `.env` uma vez só.
- Tela: painel de empresas (lista, adicionar pelo link, diretório, teclado nas abas).
