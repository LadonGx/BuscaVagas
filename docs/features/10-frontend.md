# 10 — Frontend (Fase 2)

As seis telas do protótipo, tema **Noite violeta** escuro e claro. Antes
deste passo vem o [09](09-screen-data.md), que cria as rotas de contagem,
painel e status das fontes.

Protótipo visual: canvas "BuscaVagas — visual do frontend". Quando o código
divergir do protótipo, vale o código e este plano é atualizado.

## Decisões

| Tema               | Escolha                                                  | Por quê                                                                                 |
| ------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Rotas              | React Router 8, modo dados (`createBrowserRouter`)       | Filtros vão para a URL: voltar funciona e um filtro pode ser salvo nos favoritos        |
| Dados do servidor  | TanStack Query 5                                         | Cache, paginação infinita, atualização otimista com desfazer, polling só quando precisa |
| Estilo             | CSS Modules + variáveis CSS                              | Os tokens do protótipo viram variáveis; o tema troca com um atributo na raiz, sem lib   |
| Ícones             | `lucide-react`                                           | Mesmo traço dos ícones do protótipo; só os ícones usados entram no build                |
| Fontes             | Sora, DM Sans e JetBrains Mono via `@fontsource`         | App local: funciona sem internet e não chama o Google a cada abertura                   |
| Contratos          | `@busca-vagas/shared` como dependência do web            | Mesmos tipos, enums, rótulos, faixas de nota e `resumeItemToText` da API                |
| Formulários        | Estado local + schema Zod do `shared` no envio           | Os formulários são pequenos; uma lib de formulário não paga o peso aqui                 |
| Arrastar no quadro | `@dnd-kit/core`, com menu "Mover para…" como alternativa | Arrastar com teclado e leitor de tela já vem pronto                                     |
| Testes             | Vitest + Testing Library + jsdom, `fetch` simulado       | O mesmo Vitest do resto do monorepo                                                     |

## Estrutura

```
apps/web/src/
  main.tsx                 fontes, estilos, QueryClient, avisos, Router
  routes.tsx               rotas e layout (o menu segue a mesma ordem)
  styles/
    tokens.css             variáveis do tema (escuro e claro)
    base.css               reset, fontes, foco visível, prefers-reduced-motion
  api/
    client.ts              fetch + ApiError/ApiOfflineError + query string; mensagens em PT-BR
    keys.ts                chaves do TanStack Query, num lugar só
    queryClient.ts         padrões: 15 s de cache, 4xx não tenta de novo
    health.ts overview.ts discovery.ts   (base) · jobs.ts applications.ts resume.ts
    preferences.ts dashboard.ts maintenance.ts   (chegam com as telas)
  components/              peças usadas em mais de uma tela
    layout/  AppLayout, Sidebar (menu + tema), ScanStatus, OfflineBanner, nav.ts
    toast/   ToastProvider + useToast
    ui/      Button, PageHeader, EmptyState  (depois: IconButton, Pill, Field, Drawer, Dialog…)
    ScanButton  (depois: ScoreBadge, ReasonList, JobChips, StackChips, StatusChip, CopyButton)
  features/
    inicio/ vagas/ deslizar/ candidaturas/ curriculo/ preferencias/
  lib/
    format.ts              datas relativas ("há 2 dias"), moeda, rótulos dos enums
    score.ts               faixa da nota → tom de cor; motivo principal do cartão
    theme.ts               tema salvo + useTheme
    useNow.ts              relógio para "em 3 h 58 min"
    useHotkeys.ts  useInfiniteScroll.ts   (chegam com as telas)
  test/
    setup.ts  render.tsx (app com providers e rota)  api-mock.ts (fetch por rota)  fixtures.ts
```

Cada tela fica em `features/<tela>/` com a página, os componentes só dela e
os testes. Componente que aparece em duas telas sobe para `components/`.

## Tema

- Os tokens do protótipo (`--bg`, `--surface`, `--accent`, `--great-bg`…)
  vão para `tokens.css` em `:root[data-theme='escuro']` e
  `:root[data-theme='claro']`.
- Padrão: **escuro**. O botão no rodapé do menu alterna e grava em
  `localStorage` (com `try/catch`; sem storage, fica no escuro).
- Um script inline no `index.html` aplica o tema antes do React montar, para
  não piscar claro → escuro.
- Cores de estado sempre com texto ou símbolo junto (nota em número, + − ? ×
  nos motivos, nome do status no chip). Cor nunca é a única informação.

## Comportamentos comuns

- **Nota da vaga** (`ScoreBadge`): faixa pela constante `SCORE_TIERS` do
  `shared` — ≥ 800 verde, 600–799 âmbar, abaixo cinza, incompatível com
  borda vermelha e nota 0, calculando com borda tracejada e "…", sem
  preferências com "—" e dica para configurar. A barrinha embaixo do número é
  a cobertura.
- **Triagem otimista com desfazer**: salvar/descartar some do cartão na hora;
  um aviso no rodapé oferece "Desfazer" por 6 s (`PUT /triage` com `inbox`).
  Se a API falhar, o cartão volta e o aviso mostra o erro.
- **Nota calculando**: enquanto alguma vaga da página estiver com
  `scorePending`, a lista recarrega a cada 3 s; quando nenhuma estiver, para.
- **Buscar agora**: `POST /discovery/scan`; o botão fica "Buscando…" enquanto
  alguma fonte estiver `running` (polling de 3 s nas fontes) e, no fim,
  as vagas e as contagens são recarregadas. Fonte inativa aparece no aviso
  com o motivo ("GREENHOUSE_COMPANIES vazio").
- **API fora do ar**: faixa no topo com o comando para subir a API; as
  telas mostram o último dado em cache.
- **Paginação**: `useInfiniteQuery` com o `nextCursor`; carrega mais ao chegar
  perto do fim (IntersectionObserver), com botão "Carregar mais" de reserva.
- **Teclado**: foco visível em tudo; `Esc` fecha painel e diálogo; atalhos
  de cada tela listados num "?" no rodapé do menu.

## Telas

### Início — `/`

Dados: `GET /api/dashboard` + `GET /api/jobs/counts`.

- Atalhos: Triar no deslizar (com o número), Ver vagas (salvas), + Vaga
  manual (abre o mesmo diálogo da tela de Vagas), Currículo.
- "Esta semana": vagas novas desde ontem, caixa com nota ≥ 800, etapas até
  sexta, propostas.
- Melhores vagas novas (`topNew`): clicar abre o painel da vaga, como em Vagas.
- Próximas etapas (`upcomingSteps`): clicar leva para Candidaturas com a
  candidatura aberta.
- Vagas novas por dia: barras de uma série só, sem legenda (o título diz o que
  é), número no pico e em todas ao passar o mouse; tabela escondida para
  leitor de tela.
- Funil: Aplicada → Em processo → Proposta, com a % da etapa anterior, e a
  mediana de dias até a primeira resposta.

### Vagas — `/vagas`

Dados: `GET /api/jobs` (infinito), `GET /api/jobs/:id` no painel.

- Grade de cartões (`auto-fill, minmax(300px, 1fr)`): empresa, título, nota
  com cobertura, chips (modalidade, local, contrato, senioridade), até 4
  stacks + "+N", motivo principal em uma linha, status, "há X dias" e ações
  (salvar, descartar, detalhes, abrir no site).
- Barra: busca (`q`, com 300 ms de espera), modalidade, nota mínima, ordem.
  Pílulas: Caixa · Salvas · Com candidatura (`hasApplication`) · Descartadas,
  com as contagens de `/jobs/counts`. Tudo na URL.
- Painel lateral (`Drawer`): nota grande, cobertura, motivos com + − ? ×,
  stack, descrição em texto (quebras de linha mantidas), e Salvar /
  Me candidatei / Descartar… (motivo opcional).
- "Me candidatei" cria a candidatura (`POST /applications`) e oferece ir para
  Candidaturas.
- "+ Vaga manual": diálogo com título, empresa, link, local, modalidade,
  contrato, senioridade e notas, validado com `createJobInputSchema`.

### Deslizar — `/deslizar`

Dados: `GET /api/jobs?triage=inbox&sort=score&hideIncompatible=true`.

- Um cartão por vez, com a próxima por trás; barra de progresso; contadores
  de salvas e descartadas da sessão.
- `→` salva, `←` descarta, `↑` ou espaço abre o detalhe, `Ctrl+Z` desfaz.
  Botões grandes fazem o mesmo. Arrastar o cartão com mouse ou toque também
  (limite de 120 px; animação desligada com `prefers-reduced-motion`).
- Desfazer guarda as últimas 20 ações da sessão (pilha local).
- Busca a próxima página quando faltam 5 cartões. Caixa vazia mostra
  "Tudo triado" e a hora da próxima busca.

### Candidaturas — `/candidaturas` e `/candidaturas/:id`

Dados: `GET /api/applications` por coluna, `GET /api/applications/:id`.

- Quadro: Aplicada · Em processo · Proposta · Encerradas (Recusada +
  Desisti). Cartão com título, empresa, status, "há X dias" e a próxima etapa
  em destaque.
- Mover de coluna (arrastar ou menu "Mover para…") registra um evento de
  status com a data de hoje (`POST /applications/:id/events`); a data pode
  ser corrigida depois na linha do tempo.
- Painel da direita: linha do tempo, próxima etapa, "Registrar etapa"
  (status, data, nota, próxima etapa) e editar/apagar evento.
- Alternância Quadro / Lista; a lista é uma tabela ordenável.

### Currículo — `/curriculo` e `/curriculo/imprimir`

Dados: `GET /api/resume`. O modelo de dados do [04](04-resume.md) continua
igual; muda só a apresentação (formulário centralizado, como no job-tracker).

- Cabeçalho: "Ver e salvar PDF" e "Salvar".
- Caixa "Importar de PDF": **só visual nesta fase** — botão desabilitado com
  "Chega na Fase 3". O leitor de PDF é o item da Fase 3.
- Cada seção vira um cartão:
  - `fields` → grade de 2 colunas (Dados pessoais, Contato, Links,
    Competências, Idiomas, Respostas prontas), botão "Copiar" em cada campo;
  - `text` → área de texto (Resumo) com "Copiar" e contador;
  - `entries` → cartões de experiência, formação, projetos e cursos, com
    "Copiar" e edição no lugar.
- **Copiar um campo copia só o valor** (o formulário da vaga já tem o
  rótulo). Copiar uma seção ou uma entrada usa `resumeItemToText`, o mesmo
  texto do `/export`. O botão vira "Copiado" por 1,5 s.
- "Salvar" envia só os itens alterados (`PATCH /resume/items/:id`), em
  sequência. Com algo não salvo: aviso ao sair da página e `Ctrl+S` salva.
- Adicionar item, adicionar/renomear/apagar seção e reordenar com
  "subir/descer" (`PUT .../order`).
- "Ver e salvar PDF" abre `/curriculo/imprimir`: o currículo em página A4
  com CSS de impressão e `window.print()` — o navegador oferece "Salvar como
  PDF". Sem gerar PDF no servidor.

### Preferências — `/preferencias`

Dados: `GET/PUT /api/preferences`, `GET /preferences/stacks`,
`GET /discovery/sources`, `GET /discovery/runs`, `GET /maintenance/retention`.

- Stacks em três grupos (principais, ganham pontos, evitar) com sugestões
  vindas de `/preferences/stacks`; a mesma stack não entra em dois grupos
  (a regra já está no schema).
- Senioridade, contrato e modalidade como botões liga/desliga; cidades,
  idade máxima, salário mínimo e empresas bloqueadas.
- "Salvar e recalcular" → `PUT`; aviso "Notas sendo recalculadas" e a prévia
  ("Com estas preferências") atualiza quando a fila termina.
- Fontes: estado de cada uma, última execução, próxima busca e o motivo
  quando inativa. "Ver histórico de buscas" abre o painel com `/discovery/runs`.
- Limpeza: prévia da próxima limpeza (`GET /maintenance/retention`).
- As empresas dos boards continuam no `.env` nesta fase; a tela só mostra
  quais estão configuradas.

## Ordem de execução

Cada item é um passo com teste e revisão antes do próximo.

1. ✅ **Base**: dependências, tokens e fontes, layout com menu e tema, rotas
   vazias, cliente da API, QueryClient, avisos (toast), faixa de API fora do ar,
   "Buscar agora" com o estado das fontes.
2. **Componentes de vaga**: `ScoreBadge`, `ReasonList`, chips, `Drawer` — com
   testes das faixas de nota.
3. **Vagas**: grade, filtros na URL, painel, triagem com desfazer, vaga manual.
4. **Deslizar**.
5. **Candidaturas**: quadro, mover de coluna, linha do tempo.
6. **Currículo**: formulário, copiar, salvar, impressão.
7. **Preferências**: formulário, fontes, histórico, limpeza.
8. **Início**: painel.

## Testes

- `lib/score.ts`: faixas nas bordas e motivo principal (bloqueio > positivo).
- Triagem otimista: some na hora, volta com erro da API, desfazer chama `inbox`.
- Deslizar: setas, `Ctrl+Z`, busca a próxima página com 5 restantes.
- Currículo: copiar campo copia só o valor; salvar envia só o que mudou.
- Tema: o atributo muda na raiz e a escolha fica salva.
- Acessibilidade: cada tela renderiza sem botão sem nome (checagem simples
  com Testing Library).

## Fora desta fase

Leitor de PDF do currículo, telas de E-mails e Métricas, empresas dos boards
editáveis pela tela e notificação de vaga nova — todos na Fase 3.
