# 09 — Dados para as telas

Pequenas adições no backend que as telas da Fase 2 precisam. Vem **antes**
do front para que cada tela já nasça falando com a rota certa, sem
gambiarra no cliente (somar páginas, buscar tudo para contar etc.).

Protótipo visual: canvas "BuscaVagas — visual do frontend" (Início, Vagas,
Deslizar, Candidaturas, Currículo, Preferências). Plano do front:
[10-frontend.md](10-frontend.md).

## O que cada tela pede e ainda não existe

| Tela               | Precisa de                                                     | Solução                            |
| ------------------ | -------------------------------------------------------------- | ---------------------------------- |
| Menu (todas)       | Números ao lado de Vagas, Deslizar e Candidaturas              | `GET /api/jobs/counts` + summary   |
| Vagas              | Pílula "Com candidatura"                                       | filtro `hasApplication` em `/jobs` |
| Menu, Preferências | "Próxima busca em 3 h 58 min", botão "Buscar agora" ocupado    | `nextRunAt` e `running` nas fontes |
| Preferências       | "Com estas preferências: 42 ≥ 800 · 61 entre 600–799 · 18 ×"   | faixas de nota em `/jobs/counts`   |
| Início             | Vagas novas por dia, próximas etapas, funil, tempo de resposta | `GET /api/dashboard`               |

## `GET /api/jobs/counts`

Uma consulta só (`count(*) FILTER (...)`), sem paginação. Fica **antes**
de `:id` no controller, como o `summary` das candidaturas.

```ts
interface JobCountsDto {
  triage: { inbox: number; saved: number; dismissed: number };
  /** Vagas com candidatura (qualquer status). */
  withApplication: number;
  /** Só caixa + salvas — o que a pessoa ainda vê na lista. */
  score: {
    great: number; // ≥ 800
    good: number; // 600–799
    weak: number; // abaixo de 600
    incompatible: number; // nota 0 por regra
    pending: number; // na fila de cálculo
    unscored: number; // sem preferências / sem sinal
  };
  /** Caixa de entrada sem as incompatíveis — o número do Deslizar no menu. */
  swipeable: number;
}
```

- As faixas ficam em `packages/shared`: `SCORE_TIER_MIN` (800 e 600) e a
  função `scoreTier(job)`. O front usa a mesma função para colorir o selo
  da nota, então número e cor nunca divergem.
- Ordem das faixas, igual à de `scoreTier`: **na fila** (`scoredVersion`
  nulo ou menor que a versão atual das preferências — ver o
  [07](07-preferences-score.md)) vem antes de tudo, porque a nota antiga pode
  estar desatualizada;
  depois **incompatível**; depois **sem nota**; depois a faixa pela nota.
- O Deslizar esconde as incompatíveis por padrão, por isso o menu usa
  `swipeable` e não `triage.inbox`.
- A prévia da tela de Preferências mostra as contagens com as preferências
  **salvas**. Simular preferências ainda não salvas fica para depois (ver
  "Depois").

## Filtro `hasApplication` em `/api/jobs`

`hasApplication=true|false`, mesmo formato do `hideIncompatible`.
Com `true`, o filtro de triagem padrão (`inbox,saved`) **não** se aplica:
vaga com candidatura aparece mesmo que tenha sido salva ou esteja na caixa.

## Fontes: próxima busca e o que está rodando

`SourceInfoDto` ganha dois campos:

```ts
/** Próxima execução agendada. `null` = inativa, sem agenda ou fila fora do ar. */
nextRunAt: string | null;
/** Há job desta fonte na fila ou rodando agora. */
running: boolean;
```

- `nextRunAt` vem de `queue.getJobSchedulers()` (campo `next` de
  `schedule:<fonte>`).
- `running` vem de `getJobs(['waiting', 'active', 'prioritized'])` filtrado
  pela fonte. **`delayed` não conta**: é ali que o agendador deixa a
  próxima execução esperando a hora, então toda fonte agendada pareceria
  "rodando".
- Redis fora do ar ou lento não derruba a rota: depois de 1,5 s ela responde
  com `nextRunAt: null` e `running: false`.
- O front faz polling de `/discovery/sources` a cada 3 s **só** enquanto
  alguma fonte estiver `running`; quando termina, invalida as vagas.

## `GET /api/dashboard`

Uma rota só para o Início, para a tela abrir com uma requisição.

```ts
interface DashboardDto {
  /** Vagas que entraram por dia (firstSeenAt), últimos 14 dias, dias sem vaga com 0. */
  newJobsPerDay: { date: string; count: number }[]; // date = AAAA-MM-DD
  /** Vagas que entraram nas últimas 24 h. */
  newLast24h: number;
  /** Caixa de entrada com nota ≥ 800. */
  highScoreInbox: number;
  /** Caixa, entraram nos últimos 7 dias, compatíveis e já pontuadas, pela nota. */
  topNew: JobDto[]; // até 5
  /** Candidaturas abertas com próxima etapa de hoje (meia-noite local) em diante. */
  upcomingSteps: ApplicationDto[]; // até 5
  /** Abertas com etapa de hoje até o fim do 7º dia (calendário local). */
  stepsNextDays: number;
  /** Quantas candidaturas já passaram por cada etapa (pelo histórico, não pelo status atual). */
  funnel: { applied: number; inProcess: number; offer: number };
  /** Mediana de dias entre a candidatura e o primeiro evento que não é "Aplicada". */
  medianDaysToFirstResponse: number | null;
}
```

- **Dias no fuso da máquina**: o app é local, então o fuso do processo da API
  é o da pessoa (`dashboard/local-day.ts`). `firstSeenAt` é gravado em UTC
  sem fuso, então o SQL faz `("firstSeenAt" AT TIME ZONE 'UTC') AT TIME ZONE <fuso>`
  antes de pegar o dia. Os 14 dias são contados no calendário (não em blocos
  de 24 h), então horário de verão não pula nem repete dia; dias sem vaga
  ficam com 0.
- **Funil pelo histórico**: "Aplicada" = todas as candidaturas; "Em
  processo" = as que tiveram evento em processo **ou** proposta (quem chegou
  à proposta passou pelo processo, mesmo sem o evento registrado);
  "Proposta" = as que tiveram evento de proposta. Recusada e Desisti não são
  etapa. Uma que chegou à proposta e depois foi recusada conta nas três.
- **Próximas etapas** ignora candidaturas recusadas ou desistidas, mesmo com
  `nextStepAt` preenchido.
- **Mediana** com uma casa decimal; `null` enquanto nenhuma candidatura teve
  resposta.

## Testes

- Unit `scoreTier` (bordas e ordem) e `buildJobWhere` com `hasApplication`.
- Unit `local-day`: 23h30 de São Paulo já é o dia seguinte em UTC, virada de
  mês, horário de verão.
- Integração `counts`: faixas nas bordas (599, 600, 799, 800), nota antiga na
  fila conta como pendente, descartada fora do bloco `score`.
- Integração `hasApplication`: aparece em qualquer triagem com `true`,
  respeita `triage` quando pedido, some com `false`, valor inválido → 400.
- Integração `dashboard`: série de 14 dias com zeros, vaga das 23h30 conta
  no dia certo, melhores novas só da caixa/7 dias/compatíveis, próximas
  etapas desde a meia-noite local, funil pelo histórico, mediana com
  quantidade ímpar e par.
- Integração das fontes com a fila falsa: `nextRunAt`, `running`, fila com
  erro e fila que não responde.

## Depois

- `POST /api/preferences/preview`: calcular as faixas com preferências ainda
  não salvas, em memória (a função `scoreJob` é pura), para a prévia mudar
  enquanto a pessoa mexe no formulário.
