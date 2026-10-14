# 16 — Aviso de vaga nova com nota alta

Um **sino** no topo do menu avisa quando chega vaga nova com nota alta —
sem precisar abrir a caixa para descobrir.

## Decisões

- **Só o sino, por enquanto.** O aviso no celular (ntfy ou Telegram) fica
  para depois, no [ROADMAP](../ROADMAP.md); os avisos já ficam guardados, então
  o canal novo só precisa enviá-los.
- **Horário de silêncio (22h–8h)** foi escolhido, mas só faz sentido num
  aviso que interrompe (celular): entra junto com ele. O sino não toca.
- **Nota mínima ajustável, padrão 800** (a faixa "ótima"), em Preferências →
  "Aviso de nota alta". `0` desliga. Fica fora das preferências de busca:
  mudar o aviso **não** recalcula as notas.
- **Um aviso por rodada de notas** ("3 vagas novas com nota alta"), não um
  por vaga. Cada vaga avisa **uma vez só**.
- **Só vaga nova de verdade:** entrou nas últimas 48 h. Recalcular as notas
  depois de mudar as preferências não acorda vagas antigas.
- Fica de fora: incompatível, encerrada (ou prazo vencido), já triada (salva
  ou descartada — repostagem silenciada entra descartada), nota ainda na fila
  ou calculada com preferências antigas.

## Como funciona

```
busca ─► ingest ─► fila scoring ─► scoreStale() ─► notifications.collect()
                                                   └─ vagas que passam no filtro
                                                      ─► 1 Notification + Job.notifiedAt
web: sino confere GET /api/notifications a cada 1 min ─► número, painel, toast
```

`collect()` também apaga avisos com mais de 30 dias.

## Dados

| Modelo / campo                         | O que é                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `Notification`                         | `kind` ("high-score"), `minScore` daquele momento, `createdAt`, `readAt` |
| `Job.notifiedAt`, `Job.notificationId` | a vaga já avisou, e em qual aviso (`SetNull` se o aviso sumir)           |
| `NotificationSettings` (linha única)   | `minScore` (padrão 800; 0 = desligado)                                   |

Migração `20261016120000_notifications` (rode `pnpm db:deploy`).

## API

| Método | Rota                          | O que faz                                                                                     |
| ------ | ----------------------------- | --------------------------------------------------------------------------------------------- |
| `GET`  | `/api/notifications`          | `{ unread, items }` — os 20 mais recentes, com as vagas como estão agora (triagem, encerrada) |
| `POST` | `/api/notifications/read`     | marca todos como lidos                                                                        |
| `GET`  | `/api/notifications/settings` | `{ minScore }`                                                                                |
| `PUT`  | `/api/notifications/settings` | `{ minScore: 0..1000 }`                                                                       |

## Tela

- **Sino** no topo do menu, com o número de não lidos (9+).
- **Painel "Avisos"**: cada aviso com o título, "novo" e há quanto tempo; as
  vagas com a nota e, se mudou, "descartada", "salva" ou "encerrada".
  Clicar abre a vaga em `/vagas?vaga=<id>`. Abrir o painel marca tudo como
  lido. "Mudar a nota" leva a Preferências; "Ver a caixa pela nota" abre a
  caixa ordenada pela nota.
- **Toast** "N vagas novas com nota alta · Ver" quando um aviso chega com o
  app aberto (o que já estava lá ao abrir o app não vira toast).
- **Preferências → "Aviso de nota alta"**: liga/desliga e a nota mínima (1 a
  1000), com "Salvar avisos" separado do formulário de busca.

## Testes

- Shared: título no singular e no plural; nota mínima válida.
- API: junta as novas de nota alta num aviso e não repete; tudo que fica de
  fora (abaixo da nota, incompatível, antiga, salva, encerrada, prazo vencido,
  nota na fila, versão antiga das preferências); lista e "lido"; vaga mostra
  a situação de agora e as apagadas somem; configuração (padrão, ajuste,
  desligado, inválido); limpeza dos avisos com mais de 30 dias.
- Tela: número no sino, painel (marca lido, situação das vagas, aviso sem
  vagas, abrir uma vaga); toast de aviso novo e "Ver"; card de Preferências
  (nota inválida, salvar 900, desligar); situação da vaga.
