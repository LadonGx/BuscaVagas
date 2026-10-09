# 00 — Base compartilhada

Infra comum que todas as features usam. Sem migration.

## Contratos em `packages/shared`

Todo schema de **entrada** (corpo e query) e de **saída** (DTO) vive em
`packages/shared/src/<feature>.ts`, em Zod. A API valida com eles; o front
importa os mesmos tipos. Um contrato, dois lados.

Os DTOs de saída usam datas como string ISO (o que o JSON entrega). A API
converte as linhas do Prisma em DTO por funções `toXxxDto` explícitas — nada
de devolver a linha do banco direto, para não vazar campo interno.

## Validação: `ZodValidationPipe`

```ts
@Body(new ZodValidationPipe(createJobInputSchema)) body: CreateJobInput
@Query(new ZodValidationPipe(jobListQuerySchema)) query: JobListQuery
```

Falha → **400** no formato:

```json
{
  "statusCode": 400,
  "message": "Dados inválidos",
  "issues": [{ "path": "title", "message": "..." }]
}
```

Query string com lista aceita os dois formatos: `?workModel=remote&workModel=hybrid`
e `?workModel=remote,hybrid`.

## Erros: `PrismaExceptionFilter` (global)

| Erro do Prisma            | HTTP | Quando                                    |
| ------------------------- | ---- | ----------------------------------------- |
| P2002 (unique)            | 409  | dois registros com a mesma chave única    |
| P2025 (não encontrado)    | 404  | update/delete de id inexistente           |
| P2003 (chave estrangeira) | 409  | apagar algo que outro registro referencia |

Regras de negócio lançam as exceções do Nest (`ConflictException` etc.) com
mensagem em português e, quando útil, o id relacionado (ex.: `existingJobId`).

## Paginação por cursor

Listagens devolvem `{ items, nextCursor }`. O cursor é opaco (base64url de
`{ t: data, id }`) e a ordenação sempre tem o `id` como desempate. Por que
cursor e não `offset`: na triagem você descarta vagas entre uma página e
outra, e um offset pularia vagas em silêncio.

Query: `?limit=30&cursor=<nextCursor>` (`limit` de 1 a 100, padrão 30).
Cursor inválido → 400.

## Testes de integração com Postgres real

- Arquivos `*.int.spec.ts` rodam contra o banco `buscavagas_test`
  (`TEST_DATABASE_URL` no `.env`). Sem a variável, são **pulados** com aviso.
- Antes da rodada, o `globalSetup` cria o banco se faltar, zera o schema e
  aplica todos os `prisma/migrations/*/migration.sql` em ordem — sem depender
  do binário do Prisma.
- Entre testes, `resetDatabase()` faz `TRUNCATE` de todas as tabelas.
- Os testes HTTP sobem um app Nest com os mesmos filtros/pipes do `main.ts`
  (`configureApp`) e usam `supertest`.
- O CI ganha um serviço Postgres para rodar esses testes.

Mockar o Prisma deixaria o teste verde com query errada; o banco real pega.
