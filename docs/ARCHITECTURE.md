# Arquitetura

## Visão geral

```
            ┌──────────────────────── apps/api (NestJS) ────────────────────────┐
            │                                                                    │
 apps/web ──┤  HTTP /api  ──►  módulos (jobs, applications, resume, discovery)   │
 (React)    │                         │                       │                  │
            │                         ▼                       ▼                  │
            │                  PostgreSQL (Prisma)     fila source-scan (BullMQ)  │
            │                                                 │                  │
            └─────────────────────────────────────────────────┼──────────────────┘
                                                              ▼
                                               packages/sources (uma pasta por site)
                                                              │
                                                              ▼
                                                 Gupy, Greenhouse, Lever, Ashby...
```

- **`apps/api`** é dona do banco e da fila. Nada além dela fala com o Postgres.
- **`packages/sources`** só busca e padroniza vagas. Não conhece banco, fila
  nem NestJS — recebe um cliente HTTP e devolve `JobPosting[]`.
- **`packages/shared`** guarda os contratos (schemas Zod) usados por todos.
- **`apps/web`** fala com a API só por HTTP (`/api`, via proxy do Vite no dev).

## Decisões

### App local, sem autenticação

O app é baixado e roda na máquina de cada pessoa. Isso elimina hospedagem,
cadastro de usuários e, principalmente, o problema de um servidor fazendo
scraping em nome de muita gente. O custo é que a API não pode ficar exposta:
tudo escuta em `127.0.0.1` e a API checa o `Host` de cada requisição
(`apps/api/src/common/security/local-only.ts`).

### Uma pasta por site, todas atrás do mesmo contrato

Cada fonte vive em `packages/sources/src/<site>/` com schema, mapper, fixture
e teste próprios, e implementa a interface `JobSource`. As regras que mantêm
uma fonte quebrada longe das outras:

1. O `core/` nunca importa de uma fonte; as fontes só se registram em
   `registry.ts`.
2. Cada fonte roda com prazo próprio e isolada (`runSource`): falha vira um
   resultado `failed`, nunca uma exceção que derruba a rodada.
3. Os testes de cada fonte usam a resposta real salva em `__fixtures__/` —
   nenhum teste acessa a rede. Se o site muda, só o teste daquela pasta falha.
4. Cada execução fica registrada em `SourceRun` (quanto trouxe, quanto
   descartou, erro). Um salto em `dropped` é o aviso de que o layout mudou.

Passo a passo: [`ADDING_A_SOURCE.md`](ADDING_A_SOURCE.md).

### Fila para trabalho lento, não para gravação rápida

A fila (BullMQ sobre Redis) existe para o que é **lento, externo ou
limitado por taxa**:

| Fila                       | Uso                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `source-scan`              | Um job por fonte: retry com backoff exponencial, limite de taxa por site, varredura agendada    |
| `scoring`                  | Nota de aderência das vagas pendentes, em lotes; baixa prioridade, um job por vez, com debounce |
| `ai-analysis` (fase final) | Concorrência 1 para modelo local; limite de requisições para APIs gratuitas                     |

Gravar vagas no Postgres **não** passa por fila: um `createMany` de mil linhas
leva milissegundos. Fila ali só adicionaria latência e pontos de falha.

A **nota** passa: a vaga é gravada e mostrada na hora, sem nota
(`scorePending: true`), e a fila `scoring` calcula logo depois. Assim um lote
grande de vagas novas ou uma troca de preferências nunca segura a listagem.

### Deduplicação no banco, não no código

Com vários jobs rodando em paralelo, "consultar se existe e depois inserir"
gera duplicata quando dois jobs fazem isso ao mesmo tempo. A regra é: a URL
canônica (`canonicalUrl`) tem `@unique` no banco e a gravação usa
`createMany({ skipDuplicates: true })` ou `upsert`.

### Contratos com Zod, validados nas bordas

Tudo que vem de fora — resposta de site, corpo de requisição, `.env` — passa
por um schema Zod antes de virar dado. Item de site que não valida é
descartado e contado (`parseEach`), sem derrubar o resto.

### Build dos pacotes compartilhados

`packages/shared` e `packages/sources` são compilados com `tsup` em formato
duplo: ESM (para o Vite) e CommonJS (para o NestJS). O `pnpm install` já
compila; depois de editar um deles, rode `pnpm build:packages`.

### Testes contra o banco de verdade

Regra de negócio que mora em query (filtro, unicidade, cascata, transação) é
testada com Postgres real, não com Prisma mockado: um mock deixaria o teste
verde com a query errada. Os arquivos `*.int.spec.ts` sobem o app Nest com a
mesma configuração do `main.ts` e fazem requisições HTTP com `supertest`.

O banco de testes (`buscavagas_test`) é recriado a cada rodada a partir dos
próprios `migration.sql` — então os testes também validam as migrations. Por
segurança, o setup recusa qualquer banco cujo nome não termine em `_test`.

Função pura (filtros → `where`, cálculo do status pelo histórico, texto do
currículo) tem teste unitário próprio, sem banco.

### Status derivado, nunca editado

O status da candidatura é sempre recalculado a partir do histórico de eventos
na mesma transação. Não existe rota para "mudar o status" direto — só para
registrar, corrigir ou apagar eventos. Assim o histórico e o status atual
nunca discordam.

## Convenções

- Código, nomes e commits em inglês; documentação em português.
- Commits no formato [Conventional Commits](https://www.conventionalcommits.org/pt-br/)
  (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
- Teste junto do código: `arquivo.ts` → `arquivo.spec.ts`.
