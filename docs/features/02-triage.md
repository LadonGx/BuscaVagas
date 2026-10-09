# 02 — Triagem: salvar/descartar

## Decisão: campo na vaga, não tabelas separadas

O roadmap previa `SavedJob` e `DismissedJob`. Como o app é de uma pessoa e
as vagas descobertas ficam guardadas no banco, a triagem vira **um campo na
própria vaga**. A mesma linha que deduplica pela URL guarda a decisão — então
**vaga descartada nunca volta** quando uma fonte trouxer de novo.

## Campos em `Job`

| Campo           | Tipo    | Observação                                                                |
| --------------- | ------- | ------------------------------------------------------------------------- |
| `triage`        | enum    | `inbox` (nova, ainda não triada) · `saved` · `dismissed` — padrão `inbox` |
| `triagedAt`     | data?   | quando você decidiu; `null` em `inbox`                                    |
| `dismissReason` | string? | opcional, só em `dismissed` (ex.: "presencial", "sênior demais")          |

Índice: `(triage, firstSeenAt)` — é o filtro mais usado da listagem.

## Rotas

| Método | Rota                   | Corpo                                          | Resposta               |
| ------ | ---------------------- | ---------------------------------------------- | ---------------------- |
| `PUT`  | `/api/jobs/:id/triage` | `{ status, reason? }`                          | `JobDto`               |
| `POST` | `/api/jobs/triage`     | `{ ids: string[], status, reason? }` (até 200) | `{ updated, skipped }` |

Desfazer = mandar `status: "inbox"`.

## Regras

- Voltar para `inbox` limpa `triagedAt` e `dismissReason`.
- `reason` só é gravado com `dismissed`; nos outros estados vira `null`.
- **Vaga com candidatura não pode ser descartada** → 409. No lote, ela entra
  em `skipped` e as outras seguem.
- Criar uma candidatura marca a vaga como `saved` automaticamente ([03](03-applications.md)).
- Listagem padrão (`GET /api/jobs`) mostra `inbox` e `saved`; descartadas só
  com `?triage=dismissed`.

## Testes

- Integração: salvar, descartar com motivo, desfazer, lote com ids
  inexistentes e com vaga que tem candidatura, descartada some da listagem
  padrão, `ingest` não ressuscita descartada.
