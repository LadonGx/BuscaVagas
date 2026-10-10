# 07 — Preferências e nota de aderência

Ordenar as vagas para você. Hoje a lista sai por data de entrada; com este
passo, sai pela **nota de aderência** (0–1000), calculada **por código** a
partir das suas preferências, com os motivos à mostra. Sem IA — a IA da
Fase 4 vai olhar só o topo dessa lista.

> **Status:** implementado.

## Decisões

- **Vaga incompatível = nota 0 + motivo, e fica na caixa de entrada.** O
  código sugere, você decide: nada é descartado automaticamente.
- **Pesos fixos no código**, numa tabela documentada (abaixo). Editáveis pela
  tela só na Fase 3, se fizer falta.
- **Preferências começam neutras.** Sem preferências, nenhuma nota é
  calculada e a lista continua por data — o app funciona igual para quem
  baixar do GitHub. O `requests.http` traz um `PUT` pronto com o seu perfil
  para ajustar e rodar.
- **Nota guardada na vaga** e recalculada pela fila quando as preferências
  mudam. Calcular a cada leitura impediria ordenar e paginar no banco.
- **Sempre em segundo plano.** A nota tem prioridade menor que as vagas: a
  vaga é gravada e aparece na hora com `scorePending: true`, e a fila
  `scoring` (fila própria, um job por vez) calcula logo depois. Nenhuma rota
  espera a nota — nem a busca das fontes, nem o cadastro, nem o `PUT` das
  preferências.

## Preferências

Uma linha só (o app é de uma pessoa). Toda lista vazia / campo `null` =
critério desligado.

| Campo              | Tipo              | Exemplo                                    |
| ------------------ | ----------------- | ------------------------------------------ |
| `stacksCore`       | tecnologias       | `node.js`, `nestjs`, `react`, `typescript` |
| `stacksPlus`       | tecnologias       | `react native`, `postgresql`, `docker`     |
| `stacksAvoid`      | tecnologias       | `php`, `delphi`                            |
| `seniorities`      | níveis            | `intern`, `trainee`, `junior`              |
| `workModels`       | modalidades       | `remote`, `hybrid`                         |
| `cities`           | texto             | `Americana`, `Campinas`, `Sumaré`          |
| `contractTypes`    | contratos         | `clt`, `pj`, `internship`                  |
| `maxAgeDays`       | dias ou `null`    | `30`                                       |
| `minMonthlySalary` | BRL/mês ou `null` | `3000`                                     |
| `blockedCompanies` | texto             | empresas que você não quer ver no topo     |

Tecnologias usam os nomes do detector de stack (`node.js`, `react native`,
`sql server`...). `GET /api/preferences/stacks` lista os nomes conhecidos e
quantas vagas citam cada um — é o que o front usa para montar a seleção.

`version` sobe a cada `PUT`; cada vaga guarda a versão com que foi pontuada.

## A nota

Cada critério dá um valor de 0 a 1, ou **"sem sinal"** quando a vaga não
informa o dado (ou o critério está desligado):

| Critério           | Peso | Regra                                                                                                                     |
| ------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------- |
| Stack              | 35   | principais encontradas (até 3 contam) valem 80%, "ganha pontos" (até 2) 20%; stack evitada na descrição corta pela metade |
| Senioridade        | 25   | igual = 1; vizinha (estágio↔trainee↔júnior↔pleno...) = 0,5; outras = 0                                                    |
| Modalidade + local | 20   | remota aceita = 1; híbrida/presencial aceita numa das suas cidades = 1, com local desconhecido = 0,5; não aceita = 0      |
| Contrato           | 10   | aceito = 1, senão 0                                                                                                       |
| Idade da vaga      | 10   | até 7 dias = 1, cai até 0 em `maxAgeDays` (usa `postedAt`, senão a data de entrada)                                       |
| Salário            | 10   | só quando a vaga informa em BRL: máximo ≥ seu mínimo = 1, abaixo = proporcional                                           |

**Nota = 1000 × Σ(peso × valor) / Σ(peso dos critérios com sinal).**
Critério sem sinal sai da conta em vez de valer zero: uma vaga da Gupy sem
salário não perde pontos por isso.

**Cobertura** = peso com sinal / peso dos critérios ligados (0–100%). Nota
1000 com 40% de cobertura é diferente de nota 1000 com 100% — o front mostra
as duas.

**Incompatível** (nota 0, motivo `block`, `incompatible: true`):

- empresa em `blockedCompanies`;
- tecnologia de `stacksAvoid` no **título** ("Desenvolvedor PHP");
- híbrida/presencial **em outra cidade**, quando `cities` está preenchido;
- modalidade fora de `workModels` (ex.: presencial quando você só aceita remoto).

**Motivos** — lista ordenada, um por critério:

```json
[
  { "criterion": "stack", "kind": "plus", "text": "node.js, react (2 de 3 principais) + docker" },
  {
    "criterion": "seniority",
    "kind": "minus",
    "text": "Pleno (você busca estágio, trainee, júnior)"
  },
  { "criterion": "contract", "kind": "unknown", "text": "Contrato não informado" }
]
```

`kind`: `plus`, `minus`, `unknown` (sem sinal) ou `block` (incompatível).

## Modelo de dados

- `Preferences` — linha única (`id = 1`), campos acima + `version`, `updatedAt`.
- `Job` ganha: `score Int?`, `scoreCoverage Int?` (0–100), `scoreReasons Json?`,
  `incompatible Boolean @default(false)`, `scoredVersion Int?`, `scoredAt DateTime?`.
  Índice `(triage, score, id)`.
- `score = null` = sem preferências (ou nenhum critério com sinal).

## Quando a nota é calculada

Tudo pela fila `scoring` — quem pede segue na hora:

| Momento                             | O que acontece                                                        |
| ----------------------------------- | --------------------------------------------------------------------- |
| Vaga entra por uma fonte (`ingest`) | entra sem nota (`scoredVersion = null`) e pede o cálculo              |
| Vaga criada ou editada à mão        | idem; a edição deixa a nota pendente de novo                          |
| `PUT /api/preferences`              | sobe a `version` e pede o cálculo; a nota antiga fica até ser trocada |
| `POST /api/preferences/rescore`     | invalida todas as notas e pede o cálculo                              |
| Subida da API                       | pede um cálculo (pega o que ficou pendente com a API parada)          |

**Pendente** = `scoredVersion` nulo **ou** menor que a versão das preferências.

**Debounce:** o job espera 500 ms antes de rodar e pedidos nessa janela caem
nele (uma varredura com 6 termos vira um cálculo só). Pedido depois da
janela cria outro job, que roda em seguida — nenhum pedido se perde.

**Lotes de 500**, um `UPDATE` por lote, relendo as preferências a cada lote.
A gravação é por SQL direto para **não mexer no `updatedAt`** (calcular a
nota não é editar a vaga) e só vale se a vaga não mudou desde a leitura —
editada no meio, ela continua pendente e entra no lote seguinte.

Redis fora do ar: a vaga é gravada normalmente e fica pendente; o pedido vira
um aviso no log e a próxima subida (ou o próximo pedido) resolve.

## Rotas

| Método | Rota                       | Observação                                                       |
| ------ | -------------------------- | ---------------------------------------------------------------- |
| `GET`  | `/api/preferences`         | preferências + `configured` + `version`                          |
| `PUT`  | `/api/preferences`         | substitui tudo; responde com as preferências e `rescoreQueued`   |
| `GET`  | `/api/preferences/stacks`  | `[{ name, jobs }]`: tecnologias conhecidas e quantas vagas citam |
| `POST` | `/api/preferences/rescore` | 202                                                              |
| `GET`  | `/api/jobs`                | novos: `sort=score\|recent`, `minScore`, `hideIncompatible`      |

`GET /api/jobs`: padrão `sort=score` quando há preferências, `recent` quando
não há. Vaga sem nota vai para o fim. O cursor passa a carregar a chave da
ordenação (`{ s: score, id }` ou `{ t: data, id }`) — cursor de uma ordenação
usado na outra é 400. A vaga (`JobDto`) ganha `score`, `scoreCoverage`,
`scoreReasons`, `incompatible` e `scorePending`.

## Onde fica o código

- `apps/api/src/modules/scoring/score.ts` — **função pura**
  `scoreJob(job, preferences, now)` → `{ score, coverage, reasons, incompatible }`.
  Sem banco, sem Nest: fácil de testar e de reaproveitar.
- `apps/api/src/modules/preferences/` — rotas, validação, `version`.
- `apps/api/src/modules/scoring/` — `ScoringService.scoreStale()` (lotes),
  o processor da fila `scoring`, o `ScoreRequester` (pedido com debounce) e
  o pedido na subida. Módulo global: vagas e preferências só pedem.
- `packages/shared/src/preferences.ts` — schemas Zod e DTOs.
- `packages/sources` exporta a lista de tecnologias conhecidas.

## Testes

- Unit (tabela): cada critério, vizinhança de senioridade, cidade com/sem
  acento ("Sumaré" = "sumare"), normalização com critérios sem sinal,
  cobertura, cada regra de incompatível, motivos.
- Integração: `GET/PUT` com validação (tecnologia que o detector não conhece
  é aceita, para não travar quem usa um nome novo, e volta em
  `unknownStacks` como aviso);
  `ingest` já grava a nota; `PUT` enfileira o `rescore`; o processor
  recalcula em lotes; listagem por nota com empate e cursor; `minScore`;
  `hideIncompatible`; sem preferências, ordem por data.

## Fora deste passo

- Pesos editáveis (Fase 3, se fizer falta).
- Nota por IA, motivos em linguagem natural (Fase 4).
- Fontes que restam da Fase 1 (repositórios do GitHub, RemoteOK/Remotive): opcionais,
  depois deste passo ou depois do frontend.
