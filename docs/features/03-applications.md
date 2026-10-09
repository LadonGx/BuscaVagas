# 03 — Candidaturas com histórico de status

## Decisões

- **Etapas (versão enxuta):** `applied` (Aplicada) → `in_process` (Em
  processo) → `offer` (Proposta), mais `rejected` (Recusada) e `withdrawn`
  (Desisti). O detalhe de cada etapa — "entrevista com RH", "teste técnico" —
  vai na **nota** do evento.
- **Transições livres:** qualquer status pode ir para qualquer outro,
  inclusive repetir `in_process` (2ª entrevista) ou reabrir uma recusada. O
  histórico registra tudo.
- **Uma candidatura por vaga** (`jobId` único).

## Modelo

`Application`

| Campo                        | Tipo        | Observação                                                        |
| ---------------------------- | ----------- | ----------------------------------------------------------------- |
| `jobId`                      | **@unique** | a vaga não pode ser apagada enquanto tiver candidatura            |
| `status`                     | enum        | **derivado** do histórico — nunca editado direto                  |
| `appliedAt`                  | data        | **derivado**: data do primeiro evento                             |
| `appliedVia`                 | string?     | onde se candidatou: site da empresa, LinkedIn, Gupy, indicação... |
| `salaryExpectation`          | int?        | pretensão informada no processo                                   |
| `notes`                      | string?     |                                                                   |
| `nextStepAt`, `nextStepNote` |             | próxima etapa: "entrevista dia 15 às 14h"                         |

`StatusEvent`

| Campo        | Tipo    | Observação                                        |
| ------------ | ------- | ------------------------------------------------- |
| `status`     | enum    | status a partir deste evento                      |
| `occurredAt` | data    | **quando aconteceu** — você informa; padrão agora |
| `createdAt`  | data    | quando você registrou                             |
| `note`       | string? |                                                   |

O DTO devolve cada evento com `previousStatus`, calculado pela ordem do
histórico — não é gravado, para nunca ficar inconsistente.

## O status atual vem do histórico

A cada evento criado, editado ou apagado, na mesma transação:

- `status` = status do evento com maior `occurredAt` (desempate: `createdAt`);
- `appliedAt` = menor `occurredAt`.

Por que separar `occurredAt` de `createdAt`: a recusa chega na segunda e você
registra na quarta. Sem a data real, "tempo até a resposta" mediria o seu
hábito de registro, não a velocidade da empresa.

## Rotas

| Método   | Rota                                    | Observação                                                                                                                                       |
| -------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST`   | `/api/applications`                     | `{ jobId, status?, occurredAt?, appliedVia?, salaryExpectation?, notes? }` → cria + 1º evento; 404 vaga; 409 já existe (`existingApplicationId`) |
| `GET`    | `/api/applications`                     | filtros `status`, `q` (título/empresa); ordem: última atualização                                                                                |
| `GET`    | `/api/applications/summary`             | contagem por status (para o quadro)                                                                                                              |
| `GET`    | `/api/applications/:id`                 | detalhe com a vaga e a linha do tempo                                                                                                            |
| `PATCH`  | `/api/applications/:id`                 | `appliedVia`, `salaryExpectation`, `notes`, `nextStepAt`, `nextStepNote` (`null` limpa)                                                          |
| `DELETE` | `/api/applications/:id`                 | apaga junto o histórico                                                                                                                          |
| `POST`   | `/api/applications/:id/events`          | `{ status, occurredAt?, note? }`                                                                                                                 |
| `PATCH`  | `/api/applications/:id/events/:eventId` | corrige `status`, `occurredAt` ou `note`                                                                                                         |
| `DELETE` | `/api/applications/:id/events/:eventId` | 409 se for o único evento                                                                                                                        |

## Regras

- `occurredAt` não pode estar no futuro (tolerância de 5 min). Data futura é
  **próxima etapa**, não evento.
- Criar candidatura marca a vaga como `saved` (mesmo se estava descartada).
- Apagar a candidatura não mexe na triagem da vaga.

## Testes

- Unit: cálculo de status/`appliedAt` a partir de eventos fora de ordem;
  `previousStatus`.
- Integração: criar (e a vaga vira `saved`), duplicada → 409, evento
  retroativo não muda o status atual, corrigir/apagar evento recalcula, não
  apaga o último evento, data futura → 400, filtros e resumo por status,
  vaga com candidatura não pode ser apagada nem descartada.
