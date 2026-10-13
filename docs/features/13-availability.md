# 13 — A vaga ainda está aberta?

Vaga que fechou não deveria ocupar a caixa nem receber candidatura. O app
descobre de três jeitos, mostra o selo **"Encerrada"** e esconde essas vagas
da caixa por padrão.

## Decisões

- **Quando conferir:** botão **"Conferir agora"** no painel da vaga e uma
  rodada **diária** nas salvas. Não confere sozinho ao abrir o painel nem
  antes de "Me candidatei" (seria uma requisição a cada clique).
- **Na tela:** selo "Encerrada" (com o motivo na dica) e o filtro **"Esconder
  encerradas"**, ligado por padrão na Caixa e em Descartadas. **Salvas e com
  candidatura nunca somem** — só ganham o selo. O Deslizar não mostra
  encerradas.
- **Sites que proíbem acesso automático** (LinkedIn, Indeed, Glassdoor,
  InfoJobs, Vagas.com — pesquisa da Fase 3 no [ROADMAP](../ROADMAP.md)): nem
  uma requisição. O painel diz "Este site não permite conferência automática:
  abra o link para ver".
- **Nunca apaga.** Encerrada é um estado; a limpeza ([08](08-retention.md))
  continua seguindo só a triagem e a data.
- **Volta a abrir:** vaga encerrada que reaparece numa busca (ou no board da
  empresa) ou que a conferência vê no ar perde o selo sozinha.

## Como sabemos

| Sinal                               | Como                                                                                                                                       | Motivo na tela                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| **Saiu do board** (passivo, grátis) | Greenhouse, Lever e Ashby trazem **todas** as vagas da empresa a cada busca. Empresa lida com sucesso: vaga dela que não veio = encerrada. | "Saiu do board da empresa"                    |
| **Prazo** (passivo)                 | Gupy manda `applicationDeadline` → `Job.deadline`. Passou: conta como encerrada (calculado na hora, sem gravar).                           | "O prazo de inscrição terminou em 08/12/2026" |
| **Conferência** (ativo)             | Uma requisição por vaga, pelo jeito certo de cada lugar (abaixo).                                                                          | o resultado da conferência                    |

Conferência (`checkAvailability`, em `packages/sources/src/core/availability.ts`;
nunca lança — falha de rede vira "Não deu para saber"):

- **Greenhouse:** `GET boards-api.greenhouse.io/v1/boards/{empresa}/jobs/{id}` —
  404 = encerrada.
- **Lever:** `GET api.lever.co/v0/postings/{empresa}/{id}` — 404 = encerrada.
- **Ashby:** a lista do board da empresa; o id não está lá = encerrada.
- **Outras (Gupy, manual, sites de carreira):** a página da vaga. 404/410 =
  encerrada; JSON-LD `JobPosting.validThrough` no passado = encerrada; texto
  como "vaga encerrada", "inscrições encerradas", "no longer accepting
  applications" (fora de `<script>`/`<style>`) = encerrada; senão, aberta.
- Sem link, ou site da lista proibida: "não deu para saber", sem requisição.

A empresa do board vem de `JobPosting.board` (o slug, gravado em `Job.board`
na entrada; vagas antigas ganham o slug na próxima busca) ou, na falta, do
link da vaga.

## Dados

`Job` ganhou:

| Campo                                    | O que é                                                             |
| ---------------------------------------- | ------------------------------------------------------------------- |
| `deadline`                               | prazo de inscrição da fonte (Gupy)                                  |
| `board`                                  | slug da empresa no Greenhouse/Lever/Ashby                           |
| `closedAt`, `closedReason`               | encerrada: quando soubemos e por quê (`null` = não sabemos de nada) |
| `checkedAt`, `checkState`, `checkReason` | última conferência ativa: quando, `open`/`closed`/`unknown`, motivo |

Migração `20261013120000_availability` (rode `pnpm db:deploy`).

`JobDto.availability`: `{ state, reason, closedAt, checkedAt, deadline }`.
`state` = `closed` se `closedAt` existe ou o prazo passou; senão o resultado
da última conferência; `null` = nunca conferida. Uma conferência que falha
(`unknown`) não desfaz um "encerrada" anterior.

## API

- `POST /api/jobs/:id/check` — confere agora e devolve a vaga. 404 se não
  existe.
- `GET /api/jobs?hideClosed=true` — sem as encerradas (salvas e com
  candidatura ficam).
- `GET /api/jobs/counts` — `inboxClosed` (encerradas na caixa); `swipeable`
  já desconta as encerradas.
- `GET /api/dashboard` — `savedClosed` (salvas sem candidatura que
  encerraram); "Melhores vagas novas" e "Nota ≥ 800" ignoram encerradas.

## Rodadas

- **Depois de cada busca num board** (`ScanRunner` → `AvailabilityService.recordBoardScan`):
  só empresas com status `ok` (404 ou erro não fecha nada). Roda depois de
  gravar as vagas.
- **Diária** (fila `maintenance`, job `availability`, agendador
  `schedule:availability`, 10 min depois da subida e a cada 24 h): salvas sem
  candidatura, ainda abertas, não conferidas nas últimas 20 h; até 100 por
  rodada, uma por segundo.

## Tela

- Cartão e Deslizar: selo "Encerrada" (vermelho) ou "Inscrições até 08/12".
- Painel: bloco "Ainda está aberta?" — estado ("Encerrada desde 10/10/2026",
  "Aberta", "Não deu para saber", "Ainda não conferida"), motivo, prazo,
  "Conferida há 2 h" e o botão "Conferir agora" (o resultado também vira
  aviso).
- Vagas: "Esconder encerradas" (URL: `encerradas=mostrar` desliga); o
  subtítulo diz quantas estão escondidas e a pílula Caixa desconta.
- Início: "N vagas salvas encerraram" leva para as salvas.

## Testes

- Sources: Greenhouse/Lever pela API (no ar = aberta, 404 = encerrada),
  Ashby pela lista, página (no ar, 404, texto de encerrada, `validThrough`
  vencido, 503 = sem saber; texto só dentro de `<script>` não conta), site
  proibido sem requisição, vaga sem link, empresa tirada do link; Gupy traz
  o prazo; boards devolvem os ids da empresa.
- API: board fecha só a empresa lida com sucesso e reabre a que volta; vaga
  vista de novo reabre; prazo vencido; `hideClosed` poupa salvas e com
  candidatura; `POST /check` (404 fecha, erro de rede não desfaz, 200 reabre,
  site proibido, vaga inexistente); rodada diária só nas devidas; contagens e
  painel; busca de board fecha a vaga que saiu.
- Tela: selos, título do estado, "Conferir agora" no painel e no cartão,
  "Esconder encerradas" (padrão, URL, contagem, some nas Salvas), aviso no
  Início.
