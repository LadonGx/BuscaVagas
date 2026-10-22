# 11 — Vaga repostada e duplicada entre fontes

A deduplicação do [01](01-jobs.md) é pela URL canônica: o mesmo link nunca
vira duas vagas. Mas a mesma vaga chega com **outro link** em dois casos:

- **Duplicada:** está em duas fontes ao mesmo tempo (Gupy e Greenhouse), ou a
  empresa publicou duas vezes.
- **Repostada:** a empresa tirou a vaga do ar e publicou de novo dias depois —
  às vezes porque não preencheu, às vezes por ser vaga "fantasma".

## Decisões

- **Duplicada = uma vaga só.** O link novo vira um _alias_ da vaga que já
  existe (`JobAlias`): não entra outra vaga na caixa, e o painel mostra
  "Também na Greenhouse" com o link. A fonte trazer o alias de novo conta como
  "vista" e mantém a vaga aberta (`lastSeenAt`).
- **Repostada = vaga nova, ligada à anterior.** Leva o selo "Repostada" e o
  que você fez com a anterior ("você descartou", "você salvou", "você já se
  candidatou"). Onde entra depende dessa decisão:
  - anterior **com candidatura** (qualquer status, inclusive "Desisti"):
    entra **já descartada**, motivo "Repostagem de vaga em que você já se
    candidatou";
  - anterior **descartada**: entra **já descartada**, motivo "Repostagem de
    vaga que você já descartou";
  - anterior salva ou ainda na caixa: entra **na caixa**.

  A Caixa e o Deslizar mostram só o que falta olhar. Em Descartadas a
  repostagem aparece com o motivo, e "Voltar para a caixa" desfaz. A
  migration `20261022120000_dismiss_decided_reposts` fez o mesmo com as
  repostagens que já estavam na caixa.

- **"Descartar sozinha se for repostada"**, por vaga: a chave fica no painel
  de toda vaga descartada. Ligada, a próxima repostagem já entra descartada,
  com o motivo "Repostagem de vaga que você pediu para descartar sempre". A
  escolha fica guardada pela impressão da vaga (`MutedRepost`) e sobrevive à
  limpeza apagar a original.
- **Só informa, não mexe na nota.** "Repostada 3×" aparece no selo; a leitura
  (vaga difícil de preencher? fantasma?) fica com você.
- **Candidatura anterior:** se você já se candidatou à vaga com outro link, o
  selo fica em destaque e o painel avisa "Você já se candidatou a esta vaga em
  DD/MM".

## Impressão digital

`apps/api/src/modules/jobs/fingerprint.ts` — `empresa|título|lugar`:

| Parte   | Normalização                                                                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| empresa | sem acento e pontuação, sem sufixo societário (Ltda, S.A., Inc...) e **sem espaços** ("Stark Bank" = "Starkbank", o nome que o Lever deriva do slug)                |
| título  | sem gênero ("(a)", "/a"), sem código de requisição ("[REQ-1234]", "#55123"), sem modalidade ("- Remoto") e sem ruído ("vaga", "urgente"); senioridade e stack ficam |
| lugar   | primeiro pedaço do local (a cidade); "remoto" para vaga remota; sem cidade, a modalidade                                                                            |

Título ou empresa que somem na normalização → sem impressão (a vaga só não é
comparada). A cidade separa vagas iguais em lugares diferentes ("Dev Júnior —
Campinas" × "Dev Júnior — Sorocaba").

## Como o `ingest` decide

Para cada link **novo** (nem vaga, nem alias, nem descartada lembrada):

1. Mesma impressão já apareceu nesta leva → alias da primeira.
2. Há vaga com a mesma impressão vista nos últimos `DUPLICATE_LIVE_DAYS` (7)
   dias → **duplicada**: alias dela.
3. Há vaga (vista nos últimos `REPOST_WINDOW_DAYS`, 180 dias) ou descartada
   apagada (`ForgottenJob`) com a mesma impressão → **repostada**: vaga nova
   com `repostOfId` (a mais recente que ainda existe), `repostCount` (quantas
   vezes já apareceu) e `previousSeenAt`. Silenciada → entra descartada.
4. Senão, vaga inédita.

`IngestResult` ganhou `duplicates` (aliases criados) e `reposts` (das
criadas, quantas eram repostagem).

**Limpeza ([08](08-retention.md)):** ao apagar uma descartada, a URL dela **e a
dos aliases** vão para `ForgottenJob`, agora com a impressão. Assim o link
antigo continua não voltando e um link novo é reconhecido como repostagem.

**Vagas antigas:** na subida da API, as vagas de antes desta versão ganham a
impressão (`FingerprintBackfill`, em lotes). Nada é ligado retroativamente —
só as próximas chegadas são comparadas com elas. Vaga manual e edição de
título, empresa, local ou modalidade recalculam a impressão.

**Corrida:** duas fontes gravando ao mesmo tempo (a fila roda 2 em paralelo)
podem, raramente, criar a mesma vaga duas vezes em vez de uma + alias. Não
quebra nada; a próxima leitura já liga as duas pela impressão.

## Modelo

- `Job`: `fingerprint` (índice), `repostOfId` (→ `Job`, `SET NULL`),
  `repostCount`, `previousSeenAt`.
- `JobAlias`: `url` (PK), `jobId` (→ `Job`, `CASCADE`), `source`,
  `externalId`, `firstSeenAt`, `lastSeenAt`.
- `MutedRepost`: `fingerprint` (PK), `title`, `company`, `createdAt`.
- `ForgottenJob.fingerprint` (índice).

Migration: `20261012180000_reposts`.

## API

| Rota                    | O que faz                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `JobDto.repost`         | `{ count, previousSeenAt, previous: { id, triage, triagedAt, application } \| null }` ou `null` |
| `JobDto.alsoOn`         | `[{ source, url }]` — os aliases                                                                |
| `GET /jobs/:id/history` | `{ repostsMuted, occurrences }`: as outras vezes (vagas e apagadas), da mais recente para trás  |
| `PUT /jobs/:id/reposts` | `{ muted }` liga/desliga "descartar sozinha se for repostada"; 400 se a vaga não tem impressão  |

## Tela

- **Cartão** (Vagas e Deslizar): selos "Repostada 2× · você descartou" e
  "Também na Greenhouse"; com candidatura anterior, o selo fica em destaque.
- **Painel da vaga**: bloco "Outros links e repostagens" com os links das
  outras fontes, a lista "Já apareceu antes" (quando foi vista, por qual
  fonte, o que você fez, link para abrir a vaga anterior ou o link antigo),
  o aviso de candidatura anterior e, em vaga descartada, a chave "Descartar
  sozinha se for repostada".

## Testes

- Unit: normalização de empresa, título e lugar; a mesma vaga escrita por
  duas fontes dá a mesma impressão; outra cidade, não.
- Integração: duplicada vira alias (e o alias conta como "vista"); duas vezes
  na mesma leva; repostada depois de sumir, com a anterior descartada (volta
  para a caixa); "descartar sempre" liga, faz a repostagem entrar descartada
  e desliga; histórico com a apagada pela limpeza e a candidatura; janela de
  180 dias; limpeza lembra os aliases e a impressão; impressão na vaga
  manual, na edição e no preenchimento das antigas.
- Tela: selos no cartão; painel com outros links, histórico e link para a
  anterior; aviso de candidatura; a chave em vaga descartada.
