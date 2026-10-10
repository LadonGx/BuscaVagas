# Fonte: Gupy

Busca por termo na plataforma da Gupy, que hospeda as páginas de carreira de
milhares de empresas brasileiras. É a principal fonte para o mercado BR.

## Endpoint

```
GET https://portal.gupy.io/api/job-search/jobs?jobName=<termo>&offset=<n>&limit=100
```

> **Histórico:** até ~02/10/2026 o endpoint era
> `employability-portal.gupy.io/api/v1/jobs`. Esse host passou a responder 404
> em qualquer caminho; a busca foi para `portal.gupy.io` com os mesmos
> parâmetros e o mesmo envelope. Sumiram dos itens `country`, `companyId`,
> `isRemoteWork` (em parte) e `isConfidentialCareerPage`.

Público, sem autenticação, JSON. Não há documentação oficial — é o endpoint
que o próprio portal de vagas da Gupy usa. Pode mudar sem aviso; por isso o
mapper é tolerante e os testes usam a resposta salva.

Resposta: `{ data: [vaga, ...], pagination: { offset, limit, total } }`.

## Manias conhecidas

| Comportamento                                                                                                                                                           | O que fazemos                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `jobName` casa só com o **título**; termos juntos (`"node react"`) quase não retornam nada                                                                              | uma busca por termo, resultado unido                   |
| `limit` máximo é 100 (`limit=200` responde 400)                                                                                                                         | `GUPY_PAGE_SIZE = 100`                                 |
| `pagination.total` devolve o tamanho da página, **não** o total do resultado                                                                                            | fim = página com menos de 100 itens                    |
| `workplaceType` é **singular**: `remote` / `hybrid` / `on-site`, e às vezes vem vazio                                                                                   | cai para o booleano `isRemoteWork`                     |
| `type` traz o contrato: `vacancy_type_effective` (CLT), `vacancy_legal_entity` (PJ), `vacancy_type_internship`, `vacancy_type_temporary`, `vacancy_type_talent_pool`... | mapeado em `gupyVacancyKind`; desconhecido vira `null` |
| Vagas de banco de talentos (`talent_pool`)                                                                                                                              | descartadas: não são vagas abertas                     |
| Empresa anônima: nome "Confidencial", logo `.../confidencial_logo.png` ou subdomínio `confidencial...` (o booleano `isConfidentialCareerPage` não vem mais)             | descartada (`isConfidentialGupyJob`)                   |
| Link da vaga em `jobUrl` (relatos citam `url`; não apareceu na resposta real de 09/10/2026)                                                                             | aceita os dois                                         |
| `vacancy_type_associate` ("associado", ~13% das vagas na amostra real) não diz se é CLT ou PJ                                                                           | contrato `other`, sem chute                            |
| `careerPageName` às vezes é o slogan da página, não a empresa (ex.: "VENHA SER #SANGUELARANJA 🧡🚀")                                                                    | usado como está, por enquanto                          |
| `city`/`state` vêm vazios em vaga remota; `state` vem por extenso ("Pernambuco")                                                                                        | local `null` quando não há cidade/estado               |
| Campos que ainda não usamos: `applicationDeadline`, `disabilities`, `badges` (`isPWD`, `friendlyBadge`); `careerPageUrl` vem sempre `null`                              | —                                                      |
| `offset` ≥ 10 000 responde 400                                                                                                                                          | teto de 20 páginas (offset ≤ 1 900)                    |
| Filtros, se um dia usarmos: `workplaceType` e `type` (vírgula); `workplaceTypes`/`jobTypes` são ignorados                                                               | —                                                      |
| `jobUrl` traz `?jobBoardSource=gupy_portal`                                                                                                                             | removido na URL canônica (é rastreamento)              |
| `description` em HTML                                                                                                                                                   | convertido para texto, até 4 000 caracteres            |

Origem dessas observações: código, issues e PRs dos projetos
[career-ops](https://github.com/career-ops-hq/career-ops/issues/4831) e
[job-tracker](https://github.com/arnaldoliro/job-tracker), que usam o mesmo endpoint.

## Configuração (`.env`)

| Variável                | Padrão |                                 |
| ----------------------- | ------ | ------------------------------- |
| `GUPY_MAX_PAGES`        | `3`    | páginas de 100 por termo (1–20) |
| `GUPY_REQUEST_DELAY_MS` | `300`  | pausa entre requisições         |

Os termos de busca são globais (`DISCOVERY_TERMS`), não desta fonte.

## Volume

Com os 6 termos padrão e 3 páginas: no máximo 18 requisições e 1 800 vagas
por varredura, com pausa de 300 ms — poucos segundos. A cada 6 horas, isso é
volume de uma pessoa navegando.

## Quando quebrar

1. `pnpm --filter @busca-vagas/sources try gupy "desenvolvedor"` — mostra o
   que veio, quanto foi descartado e o erro, se houver.
2. Muitos descartados? Grave a resposta real com `--save-fixture` e compare
   com `gupy.schema.ts`: algum campo mudou de nome ou de tipo.
3. Ajuste schema/mapper, rode `pnpm --filter @busca-vagas/sources test`.

Nada fora desta pasta precisa mudar.
