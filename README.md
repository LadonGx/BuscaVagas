# busca-vagas

Agregador **local** de vagas de emprego. Busca vagas em vários sites, junta
tudo num lugar só, organiza por aderência ao seu perfil e acelera a
candidatura.

> **Roda só na sua máquina.** Não há conta, login nem servidor: você clona,
> sobe e usa em `127.0.0.1`. Cada pessoa roda a própria instância — e faz as
> próprias buscas, em volume baixo. Veja [Segurança](#segurança).

**Status:** Fase 1 em andamento — a API já tem vagas (manuais e da Gupy,
buscadas automaticamente), triagem salvar/descartar, candidaturas com
histórico de status e currículo em blocos. Mais fontes e as telas vêm a seguir. Plano completo em
[`docs/ROADMAP.md`](docs/ROADMAP.md); planos de cada feature em
[`docs/features/`](docs/features/README.md).

## Stack

| Camada      | Tecnologia                               |
| ----------- | ---------------------------------------- |
| API         | NestJS 12, TypeScript                    |
| Banco       | PostgreSQL 17 + Prisma 7                 |
| Fila        | Redis 8 + BullMQ                         |
| Front       | React 19 + Vite                          |
| Contratos   | Zod, compartilhados em `packages/shared` |
| Monorepo    | pnpm workspaces                          |
| Infra local | Docker Compose                           |

## Estrutura

```
apps/
  api/            NestJS: rotas, banco, fila, regras de negócio
  web/            React + Vite
packages/
  shared/         schemas Zod e tipos usados por todos
  sources/        fontes de vagas — UMA PASTA POR SITE
docs/             arquitetura, roadmap, como adicionar uma fonte
docker-compose.yml  Postgres + Redis, só em 127.0.0.1
```

Detalhes e decisões em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Requisitos

- **Node.js 22.22+** (recomendado: 24 LTS) — o React Router 8 do front pede essa versão
- **pnpm 12** — `npm install -g pnpm@12`
- **Docker** (Docker Desktop no Windows/macOS)

## Começando

```bash
git clone https://github.com/LadonGx/busca-vagas.git
cd busca-vagas

pnpm install              # instala, compila packages/* e gera o Prisma Client
cp .env.example .env      # Windows (cmd): copy .env.example .env

pnpm infra:up             # Postgres (5433) e Redis (6380) no Docker
pnpm db:deploy            # aplica as migrations
```

Depois, em dois terminais:

```bash
pnpm dev:api              # API em http://127.0.0.1:3333/api
pnpm dev:web              # telas em http://127.0.0.1:5173
```

Abra **http://127.0.0.1:5173**. O menu mostra quantas vagas há em cada tela e,
no rodapé, a última busca e a próxima. Se a API, o banco ou a fila estiverem
fora, aparece uma faixa vermelha no topo dizendo o que subir. O relatório de
saúde sai em `GET http://127.0.0.1:3333/api/health`.

Para testar a API à mão, abra [`apps/api/requests.http`](apps/api/requests.http)
no VS Code com a extensão **REST Client** — há um exemplo para cada rota.

## API

| Recurso      | Rotas principais                                                                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vagas        | `POST/GET /api/jobs`, `GET/PATCH/DELETE /api/jobs/:id`                                                                                                               |
| Triagem      | `PUT /api/jobs/:id/triage`, `POST /api/jobs/triage` (lote)                                                                                                           |
| Candidaturas | `POST/GET /api/applications`, `GET /api/applications/summary`, `GET/PATCH/DELETE /api/applications/:id`, `POST/PATCH/DELETE /api/applications/:id/events[/:eventId]` |
| Currículo    | `GET /api/resume`, `GET /api/resume/export`, seções e itens em `/api/resume/sections` e `/api/resume/items`                                                          |

Detalhes, regras e códigos de erro de cada uma: [`docs/features/`](docs/features/README.md).

## Scripts

| Comando                                       | O que faz                                         |
| --------------------------------------------- | ------------------------------------------------- |
| `pnpm dev:api` / `pnpm dev:web`               | Sobe API (recompila `packages/*` antes) / front   |
| `pnpm build`                                  | Compila todos os pacotes, na ordem de dependência |
| `pnpm build:packages`                         | Recompila só `packages/*` (rode após mexer neles) |
| `pnpm lint` / `pnpm format`                   | ESLint / Prettier                                 |
| `pnpm typecheck`                              | Checagem de tipos em todo o monorepo              |
| `pnpm test`                                   | Testes (Vitest) em todo o monorepo                |
| `pnpm infra:up` / `infra:down` / `infra:logs` | Controla Postgres e Redis                         |
| `pnpm db:migrate --name <nome>`               | Cria migration após mudar o `schema.prisma`       |
| `pnpm db:deploy`                              | Aplica as migrations existentes                   |
| `pnpm db:studio`                              | Navega pelo banco no navegador                    |

## Segurança

A API **não tem autenticação, de propósito**: é um app pessoal. Isso só é
seguro porque nada fica exposto na rede:

- API, front, Postgres e Redis escutam **só em `127.0.0.1`**. A API recusa
  subir com outro host (`API_HOST`).
- A API recusa qualquer `Host` que não seja `127.0.0.1`/`localhost`
  (proteção contra DNS rebinding) e só aceita escrita com
  `Content-Type: application/json` (barra POST disfarçado vindo de outro site).
- Credenciais ficam só no `.env`, que está no `.gitignore`.

**Não publique esta API num servidor** sem antes adicionar autenticação.

## Problemas comuns

**Aviso `Unsupported engine` no `pnpm install`, ou testes do front quebrando.**
O Node está abaixo de 22.22 (`node -v`). O app pode até subir, mas o Vitest, o
jsdom e o React Router pedem 22.22+. Instale o Node 24 LTS e rode `pnpm install`
de novo.

**`http proxy error ... ECONNREFUSED 127.0.0.1:3333` no terminal do front.**
A API não estava no ar naquele instante — ainda subindo ou reiniciando (o modo
watch reinicia quando `packages/*` é recompilado). Some sozinho quando ela
termina de subir. Suba a API primeiro e o front depois.

**Porta 5433 ou 6380 em uso.** Mude `POSTGRES_PORT`/`REDIS_PORT` no `.env` e
ajuste `DATABASE_URL`/`REDIS_URL` para a mesma porta.

**`/api/health` responde 503.** O corpo diz quem caiu (`database` ou `redis`).
Rode `pnpm infra:up` e confira com `docker compose ps`.

**"Configuração inválida no .env".** A mensagem lista a variável. Compare com
o `.env.example`.

**Erro de tipo do Prisma depois de uma migration** (`Property 'score' does not
exist...`). Desde o Prisma 7, `migrate dev` não regenera o client. `pnpm dev:api`
e `pnpm test` já rodam `pnpm db:generate` antes; em outro caso, rode-o à mão.

**Mexi em `packages/shared` ou `packages/sources` e a API não viu.** A API usa
o código compilado deles (`dist/`). `pnpm dev:api` e `pnpm test` recompilam os
pacotes antes; se a API já estiver rodando, rode `pnpm build:packages` e
reinicie. Sintoma típico nos testes: `Cannot read properties of undefined`
numa constante nova do `shared`, ou um filtro novo sendo ignorado.
(`pnpm --filter @busca-vagas/sources try` lê o código-fonte direto, por isso
pode funcionar enquanto a API ainda usa a versão antiga.)

**`Could not find a declaration file for module '@busca-vagas/shared'` no
editor.** O VS Code lê os tipos de `packages/shared/dist/index.d.ts`. Se ele
olhou o pacote no meio de uma compilação (antiga, de antes do ajuste no tsup) ou
antes do primeiro `pnpm install`, guarda o erro mesmo depois de o arquivo
existir. Confira que `packages/shared/dist/index.d.ts` existe (senão rode
`pnpm build:packages`) e, no VS Code, `Ctrl+Shift+P` → **TypeScript: Restart TS
Server**. O `pnpm typecheck` é a referência: se ele passa, o código está certo.

## Licença

[MIT](LICENSE)
