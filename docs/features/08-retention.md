# 08 — Retenção e volume

Vagas que não seguiram adiante saem do banco depois de **30 dias**, para não
pesar o banco nem a tela. A limpeza roda sozinha uma vez por dia e pode ser
conferida (prévia) ou disparada à mão.

## Decisões

- **O que é apagado:**
  - **descartadas** — 30 dias depois do descarte (`triagedAt`);
  - **caixa de entrada esquecida** — vaga nunca triada que a fonte **não
    traz mais** há 30 dias (`lastSeenAt`): quase sempre já fechou.
- **O que nunca é apagado:** salvas, qualquer vaga com candidatura (inclusive
  encerrada — o histórico fica) e vagas cadastradas à mão que estão na caixa
  de entrada (nenhuma fonte atualiza o `lastSeenAt` delas). Vaga manual
  descartada segue a regra das descartadas.
- **Prazo único:** `RETENTION_DAYS=30` no `.env`; `0` desliga a limpeza.
- **Descartada apagada não volta.** Antes de apagar, a URL vai para
  `ForgottenJob` (só URL, fonte e data). Quando uma fonte trouxer a vaga de
  novo, ela é ignorada no `ingest`. Esse registro expira em 6 meses
  (`RETENTION_FORGET_DAYS=180`) — vaga reaberta depois disso é praticamente
  outra vaga.
- **Caixa esquecida pode voltar.** Ela não foi recusada por você, só sumiu da
  fonte; se reaparecer, é porque foi republicada, e entra como nova.
- **Histórico de varreduras** (`SourceRun`) mais velho que o prazo também sai.

## Como roda

| Quando                            | Como                                                                 |
| --------------------------------- | -------------------------------------------------------------------- |
| Uma vez por dia                   | agenda na fila `maintenance` (primeira execução 5 min após a subida) |
| `GET /api/maintenance/retention`  | **prévia**: quanto sairia e por quê, sem apagar nada                 |
| `POST /api/maintenance/retention` | roda agora e responde com o que apagou                               |

A agenda segue a regra da descoberta: só é recriada quando a configuração
muda — reiniciar a API em modo dev não empurra a limpeza para frente nem a
dispara de novo. `RETENTION_DAYS=0` remove a agenda.

A limpeza em si é uma transação com poucos comandos SQL (inserir as URLs em
`ForgottenJob`, apagar vagas, apagar execuções antigas, apagar registros
expirados) — milissegundos mesmo com milhares de linhas. Por isso a rota
manual responde com o resultado, sem fila.

## Modelo de dados

```prisma
model ForgottenJob {
  url         String   @id      // canônica
  source      String
  forgottenAt DateTime @default(now())
  @@index([forgottenAt])
}
```

`IngestResult` ganha `ignored`: vagas que a fonte trouxe mas estavam em
`ForgottenJob`.

## Paginação

- `/api/jobs` e `/api/applications`: já paginam por cursor (máx. 100 por página).
- `/api/discovery/runs`: passa a paginar por cursor também — a resposta vira
  `{ items, nextCursor }`, como as outras listagens.
- Frontend: na Fase 2 (rolagem infinita usando o `nextCursor`).

## Rotas

| Método | Rota                         | Resposta                                                                    |
| ------ | ---------------------------- | --------------------------------------------------------------------------- |
| `GET`  | `/api/maintenance/retention` | `{ enabled, days, cutoff, dismissed, stale, sourceRuns, forgottenExpired }` |
| `POST` | `/api/maintenance/retention` | o mesmo, com o que foi apagado de fato                                      |

## Testes

- Integração: cada regra (descartada antiga sai, recente fica; caixa esquecida
  sai, caixa vista recentemente fica; salva, com candidatura e manual na caixa
  ficam); prévia não apaga; URL da descartada vira `ForgottenJob` e o `ingest`
  ignora; caixa esquecida volta como nova; registros expirados saem;
  `SourceRun` antigo sai; `RETENTION_DAYS=0` não apaga nada.
- Unit: plano da agenda (reaproveita o `planSchedules` da descoberta, movido
  para `queue/`).
