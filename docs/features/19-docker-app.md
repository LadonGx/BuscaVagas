# 19 — App completo no Docker

Para quem só quer **usar** o app, sem Node, pnpm nem dois terminais abertos:
um comando sobe banco, fila, API e tela, e o app fica em
**http://127.0.0.1:8080**. Para programar, continue no modo dev (README).

```bash
cp .env.example .env      # Windows (cmd): copy .env.example .env
mkdir -p backups          # só no Linux, antes do primeiro app:up (ver abaixo)
pnpm app:up               # ou: docker compose -f docker-compose.yml -f docker-compose.app.yml up -d --build
```

Sem pnpm instalado, o comando do `docker compose` acima faz o mesmo.

**Linux: crie a pasta `backups/` antes do primeiro `pnpm app:up`.** O
container roda como o usuário `node` e grava nela as cópias feitas antes de
restaurar um backup. Se a pasta não existir, o Docker a cria como root, e a
restauração falha com `EACCES`. O `node` do container tem o id 1000, o do
primeiro usuário na maioria das distribuições; se o seu for outro (`id -u`),
libere a escrita também: `chmod a+rwx backups`. No Windows e no macOS (Docker
Desktop) isso não acontece.

## Decisões

- **A API entrega a tela.** Um container só para o app (`app`), um endereço
  só, sem CORS e sem um servidor a mais. A tela vai compilada
  (`apps/web/dist`) dentro da imagem, e a API passa a servi-la quando
  `WEB_DIST_DIR` está definida. No dev ela não está definida, e quem serve a
  tela continua sendo o Vite.
- **Mesmo banco do dev.** O `docker-compose.app.yml` só **acrescenta** o
  serviço `app` ao `docker-compose.yml`, que não muda: o Postgres e o Redis
  são os mesmos, com os mesmos volumes. Tudo que você já tem aparece no modo
  Docker, e o que fizer lá aparece no dev.
- **Migrações ao subir.** Antes de iniciar, o container roda
  `prisma migrate deploy`. Depois de atualizar o código, `pnpm app:up` de novo
  recompila a imagem e aplica o que faltar.
- **Porta 8080, só em `127.0.0.1`.** Não colide com o dev (3333 e 5173). Mude
  com `APP_PORT` no `.env`.
- **Sobe sozinho** com o Docker (`restart: unless-stopped`), até você rodar
  `pnpm app:down`.

## Comandos

| Comando         | O que faz                                                     |
| --------------- | ------------------------------------------------------------- |
| `pnpm app:up`   | Compila a imagem (se o código mudou) e sobe banco, fila e app |
| `pnpm app:down` | Para e remove os containers. **Os dados ficam** (volumes)     |
| `pnpm app:logs` | Mostra o que a API está fazendo (Ctrl+C sai, o app continua)  |

A primeira compilação baixa as dependências e leva alguns minutos. As
seguintes reaproveitam o cache: só refazem o que mudou.

## Dev e Docker: um de cada vez

Os dois usam o mesmo banco e a mesma fila. Se a API do dev e a do Docker
rodarem juntas, as duas fazem as buscas agendadas e a limpeza diária, e as
buscas saem em dobro. Para trocar:

- **Do Docker para o dev:** `pnpm app:down`, depois `pnpm infra:up` e os dois
  terminais de sempre.
- **Do dev para o Docker:** pare a API e o front do dev (Ctrl+C) e rode
  `pnpm app:up`.

`pnpm infra:down` sozinho não para o app (ele está no outro arquivo): use
`pnpm app:down`.

## Configuração

O container lê o seu `.env` (termos de busca, empresas acompanhadas,
retenção…). Algumas variáveis valem só lá dentro e **vencem** as do `.env`:

| Variável       | No container                            | Por quê                                           |
| -------------- | --------------------------------------- | ------------------------------------------------- |
| `DATABASE_URL` | `postgres:5432` (nome do serviço)       | Dentro da rede do Docker, não em `127.0.0.1:5433` |
| `REDIS_URL`    | `redis:6379`                            | Idem                                              |
| `API_HOST`     | `0.0.0.0`                               | Ver Segurança                                     |
| `WEB_DIST_DIR` | `/app/web`                              | Liga a entrega da tela                            |
| `BACKUP_DIR`   | `/data/backups` → `backups/` do projeto | A cópia feita antes de restaurar aparece na pasta |

Usuário e senha do banco vêm de `POSTGRES_USER`/`POSTGRES_PASSWORD`/
`POSTGRES_DB`, os mesmos do `docker-compose.yml`.

## A imagem (`Dockerfile`)

Três etapas, para a imagem final levar só o necessário:

1. **base:** Node 24 (slim), `openssl` (o motor de migrações do Prisma pede) e
   o pnpm da versão do `packageManager`.
2. **build:** `pnpm fetch` só com o lockfile (essa camada fica em cache até as
   dependências mudarem), `pnpm install --offline`, compila API e tela e
   separa as dependências de produção da API com `pnpm deploy --prod`.
   `prisma --version` confere o motor de migrações ainda no build.
3. **app:** só `dist/` da API, as migrações, as dependências de produção e a
   tela compilada. Roda como o usuário `node`, não como root.

`prisma` e `dotenv` passaram de `devDependencies` para `dependencies` da API:
o `migrate deploy` roda em produção agora.

O `.dockerignore` deixa de fora `.env`, `backups/`, `node_modules`, `dist`,
`.git` e `docs`: seus dados e segredos nunca entram na imagem.

A imagem tem `HEALTHCHECK` em `/api/health`: `docker compose ps` mostra
`healthy` quando banco e fila respondem.

## Segurança

A API não tem login: ela só é segura porque nada fica exposto na rede. No
Docker, isso continua valendo assim:

- **Porta publicada só em `127.0.0.1`** (`127.0.0.1:8080:3333`), como o
  Postgres e o Redis. Ninguém na sua rede alcança o app.
- Dentro do container a API escuta em `0.0.0.0`, senão a porta publicada não
  chega nela. O `.env` continua recusando `0.0.0.0`; ele só é aceito com
  `CONTAINER=true`, que vem do `Dockerfile`. No dev, `API_HOST=0.0.0.0` ainda
  derruba a API com "use 127.0.0.1".
- A barreira de `Host` e de `Content-Type` (`common/security/local-only.ts`)
  vale também para a tela: abrir pelo IP da máquina ou por outro nome dá 403.

## Problemas comuns

**`port is already allocated` na 8080.** Outro programa usa a porta. Ponha
`APP_PORT=8081` (ou outra) no `.env` e rode `pnpm app:up` de novo.

**O app não sobe e `pnpm app:logs` mostra erro do Prisma.** Uma migração
falhou. A mensagem diz qual; o banco fica como estava.

**Buscas em dobro.** A API do dev e a do Docker estão
rodando juntas. Veja "Dev e Docker: um de cada vez".

**Linux: a restauração do backup falha com `EACCES`.** O Docker criou a pasta
`backups/` como root (ela não existia no primeiro `pnpm app:up`). Devolva a
pasta ao seu usuário: `sudo chown "$(id -u):$(id -g)" backups` (e, se o seu id
não for 1000, `chmod a+rwx backups`). Não precisa reiniciar o app. No Windows
e no macOS isso não acontece.

## Testes

- `common/serve-web.spec.ts`: a raiz e as rotas da tela recebem o
  `index.html`; arquivos com hash ficam em cache; `/api/*` continua sendo a
  API (404 em JSON); arquivo que não existe dá 404; a barreira de `Host` vale
  para a tela; sem `WEB_DIST_DIR` nada muda.
- `config/env.spec.ts`: `0.0.0.0` só com `CONTAINER=true`.
- O build da imagem foi conferido refazendo os passos do `Dockerfile` numa
  cópia limpa do projeto (fetch, install offline, build, deploy) e subindo a
  API como no container, com a tela em `127.0.0.1:8080`.
