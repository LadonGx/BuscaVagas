# Imagem do app completo (API + tela) para o docker-compose.app.yml.
# Ver docs/features/19-docker-app.md. Para programar, use o modo dev (README).

# Node 24 LTS (o README recomenda; o mínimo é 22.22).
FROM node:24-bookworm-slim AS base
# openssl: o motor de migrações do Prisma precisa dele.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# Sem telemetria do Prisma e sem perguntas do pnpm.
ENV CHECKPOINT_DISABLE=1 CI=true
WORKDIR /repo
# A versão do pnpm vem do "packageManager" do package.json.
COPY package.json ./
RUN npm install -g "pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")"

# --- build: compila tudo -----------------------------------------------------
FROM base AS build
# Só o lockfile: esta camada (o download dos pacotes) fica em cache até ele mudar.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
# O postinstall compila packages/* e gera o Prisma Client.
RUN pnpm install --frozen-lockfile --offline
RUN pnpm --filter @busca-vagas/api build && pnpm --filter @busca-vagas/web build
# Só as dependências de produção da API (com packages/* dentro).
RUN pnpm --filter @busca-vagas/api deploy --prod /deploy
# Confere (e baixa, se faltar) o motor de migrações do Prisma ainda no build:
# no container o app roda sem permissão de escrever em node_modules.
RUN cd /deploy && node_modules/.bin/prisma --version

# --- app: o que roda -----------------------------------------------------------
FROM base AS app
ENV NODE_ENV=production \
  CONTAINER=true \
  API_HOST=0.0.0.0 \
  API_PORT=3333 \
  WEB_DIST_DIR=/app/web \
  BACKUP_DIR=/data/backups
WORKDIR /app
COPY --from=build /deploy/package.json /deploy/prisma.config.ts ./
COPY --from=build /deploy/node_modules ./node_modules
COPY --from=build /deploy/prisma ./prisma
COPY --from=build /deploy/dist ./dist
COPY --from=build /repo/apps/web/dist ./web
RUN mkdir -p /data/backups && chown node:node /data/backups
USER node
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3333/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
# Aplica as migrações pendentes e sobe a API (que também entrega a tela).
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]
