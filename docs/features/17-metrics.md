# 17 — Métricas

Tela **Métricas** (`/metricas`, no menu): o que está rendendo na busca e nas
candidaturas, no período escolhido.

## Decisões

- **Período:** 30 dias · 90 dias (padrão) · Tudo, no topo e na URL
  (`?periodo=30|tudo`). Vagas contam pela **entrada no app** (`firstSeenAt`);
  candidaturas, pela **data em que você aplicou** (`appliedAt`).
- **Stacks mais pedidas contam todas as vagas que entraram**, inclusive as
  incompatíveis: retrato do mercado das fontes, não só do que serve para você.
- **Faltam no currículo:** as mais pedidas que não aparecem nas suas
  Competências (mesmo detector das vagas, `GET /resume/stacks`). Sem nenhuma
  tecnologia reconhecida no currículo, a tela pede para preencher em vez de
  listar tudo como "falta".
- **Resposta da empresa** = o primeiro evento "Em processo", "Proposta" ou
  "Recusada" depois da candidatura (`RESPONSE_STATUSES`). **Desistir é seu e
  não conta** — a mediana do Início passou a usar a mesma regra.
- **Sem IA e sem nada novo no banco:** tudo é calculado na hora, a partir de
  vagas, candidaturas e currículo.
- Vagas que a limpeza apagou (descartadas há mais de `RETENTION_DAYS`) não
  entram — a tela avisa embaixo da tabela de fontes.

## O que a tela mostra

| Bloco                   | Conteúdo                                                                                                        | Forma                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Resumo                  | vagas que entraram (e de quantas fontes), candidaturas (com resposta), taxa de resposta, mediana até a resposta | 4 números                                                            |
| Candidaturas por semana | por semana (segunda a domingo, fuso local): enviadas e quantas tiveram resposta                                 | colunas empilhadas, legenda, dica, setas, tabela para leitor de tela |
| Tempo até a resposta    | até 3 dias · 4 a 7 · 8 a 14 · 15 a 30 · mais de 30; quantas sem resposta e quantas há mais de 14 dias           | barras horizontais com o número escrito                              |
| Rendimento por fonte    | vagas, compatíveis (%), salvas, candidaturas, respostas (%)                                                     | tabela                                                               |
| Stacks mais pedidas     | as 15 mais citadas, com "N vagas · %" e o selo "no currículo"                                                   | barras horizontais                                                   |
| Faltam no seu currículo | até 10 das mais pedidas que você não cita                                                                       | barras horizontais                                                   |

"Tudo" no gráfico por semana mostra no máximo o último ano (52 semanas).

### Cores

Uma série = acento (violeta). O gráfico por semana tem duas séries, testadas
com o validador de paleta (daltonismo, contraste) nos dois temas:

| Série        | Escuro    | Claro     |
| ------------ | --------- | --------- |
| Sem resposta | `#8b7cf6` | `#6d4fe0` |
| Com resposta | `#199e70` | `#1baf7a` |

No claro a segunda fica abaixo de 3:1 contra o branco: por isso vai sempre com
legenda, a dica com os números e a tabela escondida. O selo "no currículo" tem
ícone e texto (nunca só cor).

## API

`GET /api/metrics?days=30|90|0` (padrão 90; 0 = tudo; outro valor = 400) →
`{ days, since, sources[], stacks: { jobs, top[], missing[], resumeHasStacks },
responses: { applications, responded, medianDays, buckets[], waiting, waitingStale },
weekly[] }`.

## Testes

- Shared: semana começando na segunda (inclusive virada de ano), semanas
  entre duas datas, mediana, faixas, taxa, período.
- API: fontes (período, compatíveis, salvas, candidaturas e respostas, "tudo");
  stacks entre todas as vagas e as que faltam, currículo sem tecnologias;
  tempo até a resposta (mediana, faixas, desistência fora, espera > 14 dias);
  semanas no fuso local (domingo 23h fica na semana certa); rota e validação;
  mediana do Início sem contar desistência.
- Tela: resumo, tabela de fontes, aviso de quem espera, stacks e o selo,
  período na URL e na consulta, gráfico (nome acessível, setas, tabela,
  legenda), estados vazios.
