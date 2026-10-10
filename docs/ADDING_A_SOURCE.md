# Como adicionar uma fonte de vagas

Cada fonte é um **módulo isolado**: uma pasta em `packages/sources/src/<fonte>/`
com tudo dela — configuração, formato, conversão, busca, testes e
documentação. A API não precisa mudar para ganhar uma fonte nova.

Ponto de partida: `packages/sources/src/_template/`. Exemplos reais e completos:
`packages/sources/src/gupy/` (busca por termo) e `packages/sources/src/lever/`
(board de empresa). O passo a passo usa um site fictício chamado `acme`.

## 1. Antes de escrever código

- **Prefira API pública/JSON** a HTML. Muitos sites expõem o JSON que a
  própria página usa (aba Network do navegador).
- **Confira o `robots.txt` e os termos de uso.** Site que proíbe acesso
  automatizado fica de fora — LinkedIn, por exemplo.
- **Página HTML?** Procure o bloco `schema.org/JobPosting` (JSON-LD). É dado
  estruturado que o site publica para o Google e muda bem menos que o layout.
- Decida o tipo: `search` (busca por termo no acervo todo) ou
  `company-board` (lê o board de uma empresa por vez).

### Board de empresa: reaproveite `core/boards/`

Um ATS novo do tipo `company-board` (ex.: Workable, SmartRecruiters) não
reimplementa o loop. Copie a pasta `lever/` em vez do `_template` e use:

- `parseCompanyBoardConfig('ACME_', env)` — lê `ACME_COMPANIES`,
  `ACME_REQUEST_DELAY_MS` e os filtros comuns `BOARDS_*`;
- `noCompaniesReason('ACME_')` como `inactiveReason` — sem empresas, a fonte
  não sobe;
- `scanCompanies({ fetchCompany, mapItem, ... })` — pausa, 404 por empresa,
  filtros de título e local (`filtered`), dedup;
- o mapper devolve `{ posting, place }`: a vaga e os locais (texto + país)
  para o filtro de local.

## 2. Copie o modelo

```bash
cp -r packages/sources/src/_template packages/sources/src/acme
```

Renomeie os arquivos (`template.*` → `acme.*`) e troque `TEMPLATE`/`template`
por `ACME`/`acme` nos nomes.

## 3. Os arquivos

| Arquivo          | Regra                                                                                                                                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `acme.config.ts` | Configuração da fonte, lida do `.env` com o prefixo `ACME_` via `parseSourceEnv`. **Tudo com padrão**: a fonte funciona sem configurar nada.                                                                      |
| `acme.schema.ts` | Só os campos que o mapper usa. `.nullish()` no que às vezes falta.                                                                                                                                                |
| `acme.mapper.ts` | Função pura: item cru → `JobPosting` ou `null`. URL sempre via `canonicalUrl`. Dado ausente vira `null`, nunca palpite. Use as heurísticas de `core/normalize/` (texto, senioridade, stack).                      |
| `acme.source.ts` | Requisições sempre por `ctx.http`, repassando `ctx.signal`. Uma busca por termo (`query.terms`). Teto fixo de páginas e pausa entre requisições. Formato inesperado encerra a paginação com `ctx.log`, não lança. |
| `index.ts`       | Exporta a `SourceDefinition` (`id`, `displayName`, `kind`, `parseConfig`, `create`).                                                                                                                              |
| `README.md`      | Endpoint, limites, manias do site e o que fazer quando quebrar.                                                                                                                                                   |

## 4. Fixture e testes

Salve uma resposta (enxugada) em `acme/__fixtures__/` e inclua de propósito
itens que devem ser descartados. Nenhum teste acessa a rede.

No mínimo:

- o mapper converte o item da fixture para o `JobPosting` esperado;
- o mapper devolve `null` para os itens que não servem;
- a fonte monta as URLs certas, para no fim da paginação e conta os descartados;
- a fonte não lança quando a resposta muda de formato;
- a configuração lê o prefixo certo e recusa valor inválido.

```bash
pnpm --filter @busca-vagas/sources test
```

## 5. Registre

Em `packages/sources/src/registry.ts`:

```ts
import { acmeSourceDefinition } from './acme';

export const SOURCE_DEFINITIONS = [
  // ...fontes existentes
  acmeSourceDefinition as SourceDefinition<never>,
];
```

A ordem importa: em vaga duplicada entre fontes, vence a que vem primeiro.
Coloque antes as que trazem dados mais completos (com descrição).

## 6. Teste de verdade

```bash
pnpm --filter @busca-vagas/sources try acme "desenvolvedor"
pnpm --filter @busca-vagas/sources try acme "desenvolvedor" --save-fixture
# board de empresa: os argumentos são slugs; --no-filter mostra tudo
pnpm --filter @busca-vagas/sources try acme minha-empresa --no-filter
```

O primeiro roda a fonte contra o site real (sem gravar no banco) e mostra o
que veio, o que foi descartado e quanto de cada campo foi preenchido. O
segundo grava a resposta real em `__fixtures__/live-page.json` para os testes.

Depois: `pnpm build:packages` e reinicie a API. A fonte aparece em
`GET /api/discovery/sources` e entra na agenda automaticamente.

## Checklist

- [ ] `robots.txt` e termos de uso conferidos
- [ ] User-Agent padrão do projeto (o `ctx.http` já envia) — nunca se passar por navegador
- [ ] Teto de páginas/requisições e pausa entre requisições
- [ ] Configuração com padrões e prefixo próprio
- [ ] Fixture salva, com itens que devem ser descartados
- [ ] Testes do mapper, da fonte e da configuração passando
- [ ] `README.md` da fonte escrito
- [ ] Definição registrada em `registry.ts`
- [ ] `try` rodado contra o site real
