# 01 — Vagas

A vaga é o centro do app. Nesta fase ela entra **à mão** (você cola os dados);
na próxima, as fontes (Gupy, Greenhouse...) alimentam a mesma tabela pelo
`JobsService.ingest()`.

## Modelo `Job`

| Campo                                                      | Tipo                | Observação                                                         |
| ---------------------------------------------------------- | ------------------- | ------------------------------------------------------------------ |
| `id`                                                       | cuid                |                                                                    |
| `source`                                                   | string              | `manual` ou id da fonte (`gupy`...)                                |
| `externalId`                                               | string?             | id da vaga na fonte; único junto com `source`                      |
| `url`                                                      | string? **@unique** | URL canônica; opcional (vaga indicada pode não ter link)           |
| `title`, `company`                                         | string              | obrigatórios                                                       |
| `description`, `location`, `notes`                         | string?             | `notes` = suas anotações sobre a vaga                              |
| `workModel`                                                | enum?               | `remote` · `hybrid` · `onsite`                                     |
| `contractType`                                             | enum?               | `clt` · `pj` · `internship` · `temporary` · `other`                |
| `seniority`                                                | enum?               | `intern` · `trainee` · `junior` · `mid` · `senior` · `lead`        |
| `stack`                                                    | string[]            | normalizada: minúsculas, sem espaços nas pontas, sem repetição     |
| `salaryMin`, `salaryMax`, `salaryCurrency`, `salaryPeriod` |                     | faixa salarial; `min ≤ max`                                        |
| `postedAt`                                                 | data?               | quando a empresa publicou                                          |
| `firstSeenAt`                                              | data                | quando entrou no app (ordem da listagem)                           |
| `lastSeenAt`                                               | data                | última vez que uma fonte trouxe a vaga — base para "ainda aberta?" |
| `updatedAt`                                                | data                |                                                                    |

Índices: `url` único, `(source, externalId)` único, `company`.

## Rotas

| Método   | Rota            | Resposta                                                         |
| -------- | --------------- | ---------------------------------------------------------------- |
| `POST`   | `/api/jobs`     | 201 `JobDto` · 409 se a URL já existe (`existingJobId` no corpo) |
| `GET`    | `/api/jobs`     | `{ items: JobDto[], nextCursor }`                                |
| `GET`    | `/api/jobs/:id` | `JobDto` · 404                                                   |
| `PATCH`  | `/api/jobs/:id` | `JobDto` · 409 se a nova URL já for de outra vaga                |
| `DELETE` | `/api/jobs/:id` | 204 · 409 se a vaga tem candidatura                              |

### Filtros do `GET /api/jobs`

| Query                                              | Efeito                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| `q`                                                | busca em título e empresa (sem diferenciar maiúsculas)            |
| `workModel`, `contractType`, `seniority`, `source` | um ou vários valores                                              |
| `stack`                                            | vaga que tenha **qualquer** das tecnologias                       |
| `triage`                                           | ver [02](02-triage.md); padrão `inbox,saved`                      |
| `postedWithinDays`                                 | publicada nos últimos N dias (sem `postedAt`, vale `firstSeenAt`) |
| `limit`, `cursor`                                  | paginação                                                         |

Ordem: `firstSeenAt` desc, `id` desc.

`JobDto` traz também `application: { id, status } | null` para a lista já
mostrar quem tem candidatura.

## Regras

- A URL é canonizada (`canonicalUrl` do pacote `sources`) antes de gravar e
  de comparar. `?utm_source=` e `#fragmento` não criam vaga nova.
- Cadastro manual sempre grava `source = "manual"`.
- `ingest(postings)`: `createMany({ skipDuplicates: true })` + atualiza
  `lastSeenAt` das que já existiam. **Nunca sobrescreve** dados de uma vaga
  existente — você pode ter editado à mão.

## Testes

- Unit: normalização de stack, filtros → `where` do Prisma, validação de faixa salarial.
- Integração: criar, URL duplicada (com variação de rastreamento) → 409,
  cada filtro, paginação sem pular nem repetir, editar, apagar com/sem
  candidatura, `ingest` idempotente que não sobrescreve edição.

## Fora de escopo agora

- Busca sem acento ("junior" achar "Júnior") — exige a extensão `unaccent`.
- Ordenar por data de publicação e por nota de aderência (vem com as preferências).
