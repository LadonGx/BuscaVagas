# 10 — Frontend (Fase 2)

As seis telas do protótipo, tema **Noite violeta** escuro e claro. Antes
deste passo vem o [09](09-screen-data.md), que cria as rotas de contagem,
painel e status das fontes.

Protótipo visual: canvas "BuscaVagas — visual do frontend". Quando o código
divergir do protótipo, vale o código e este plano é atualizado.

## Decisões

| Tema               | Escolha                                                   | Por quê                                                                                 |
| ------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Rotas              | React Router 8, modo dados (`createBrowserRouter`)        | Filtros vão para a URL: voltar funciona e um filtro pode ser salvo nos favoritos        |
| Dados do servidor  | TanStack Query 5                                          | Cache, paginação infinita, atualização otimista com desfazer, polling só quando precisa |
| Estilo             | CSS Modules + variáveis CSS                               | Os tokens do protótipo viram variáveis; o tema troca com um atributo na raiz, sem lib   |
| Ícones             | `lucide-react`                                            | Mesmo traço dos ícones do protótipo; só os ícones usados entram no build                |
| Fontes             | Sora, DM Sans e JetBrains Mono via `@fontsource`          | App local: funciona sem internet e não chama o Google a cada abertura                   |
| Contratos          | `@busca-vagas/shared` como dependência do web             | Mesmos tipos, enums, rótulos, faixas de nota e `resumeItemToText` da API                |
| Formulários        | Estado local + schema Zod do `shared` no envio            | Os formulários são pequenos; uma lib de formulário não paga o peso aqui                 |
| Arrastar no quadro | `@dnd-kit/core` (mouse e toque) + "Mover para…" no cartão | O seletor é o caminho do teclado e do leitor de tela                                    |
| Testes             | Vitest + Testing Library + jsdom, `fetch` simulado        | O mesmo Vitest do resto do monorepo                                                     |

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
    ui/      Button, PageHeader, EmptyState, Drawer, Field, CopyButton
    job/     ScoreBadge, ReasonList (+ ReasonLine), Chips (JobChips, StackChips, StatusChip)
    ScanButton
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
  stacks + "+N", até dois motivos (`cardReasons`: o a favor mais importante e
  o primeiro contra; incompatível mostra só o bloqueio; cobertura abaixo de 60%
  troca o contra por "nota sobre X% dos critérios"), status, "há X dias" e
  ações (salvar, descartar, detalhes, abrir no site).
- Barra: busca (`q`, com 300 ms de espera), modalidade, nota mínima, ordem,
  "Esconder incompatíveis". Pílulas: Caixa · Salvas · Com candidatura
  (`hasApplication`) · Descartadas, com as contagens de `/jobs/counts`.
- **Tudo na URL**, em português: `aba` (`salvas`, `candidatura`,
  `descartadas`; ausente = caixa), `busca`, `modelo` (`remote,hybrid`), `nota`,
  `ordem` (`nota`/`recentes`), `incompativeis=ocultar` e `vaga=<id>` (painel
  aberto). Ex.: `/vagas?aba=salvas&modelo=remote&nota=700`.
- Ações do cartão: Salvar (ou Tirar dos salvos), Descartar (some se a vaga tem
  candidatura — a API recusa), Voltar para a caixa (na aba Descartadas),
  detalhes e abrir no site em nova aba.
- Triagem otimista (`useTriageAction`, reaproveitado no Deslizar): o cartão
  sai da aba na hora; o aviso "Vaga salva · Desfazer" volta exatamente ao
  estado anterior (caixa ou salva, com o motivo de descarte se havia). Se a API
  recusar, o cartão volta e o erro aparece.
- Painel lateral (`?vaga=`): nota grande, cobertura e situação, chips, motivos
  com + − ? ×, stack detectada, descrição como **texto puro** (conteúdo
  externo nunca vira HTML), link para o site. Rodapé: Salvar / Tirar dos
  salvos, Me candidatei (ou Ver candidatura) e Descartar… com motivo opcional
  e sugestões de um clique (Presencial, Sênior demais, Stack diferente,
  Salário baixo).
- "Me candidatei" cria a candidatura (`POST /applications`) e o aviso oferece
  abrir Candidaturas.
- "+ Vaga manual": diálogo com título, empresa, link, local, modalidade,
  contrato, senioridade, stack (separada por vírgula) e anotações, validado
  com `createJobInputSchema` antes de enviar; link repetido (409) vira mensagem
  no próprio formulário. Ao criar, abre a vaga no painel.
- Notas pendentes: enquanto alguma vaga da página está com `scorePending`, a
  lista recarrega a cada 3 s. Sem preferências, um aviso explica que não há
  nota e a ordem é por data.
- Rolagem infinita (30 por página) com "Carregar mais" de reserva; estados
  vazios diferentes para cada aba e para "nada com esses filtros".

### Deslizar — `/deslizar`

Dados: `GET /api/jobs?triage=inbox&hideIncompatible=true` (ordem automática:
pela nota com preferências, senão pela entrada no app).

- Um cartão por vez, com a próxima por trás; barra de progresso; contadores
  de salvas e descartadas da sessão.
- `→` salva, `←` descarta, `↑` ou espaço abre o detalhe, `Ctrl+Z` desfaz.
  Botões grandes fazem o mesmo. Arrastar o cartão com mouse ou toque também
  (limite de 120 px; animação desligada com `prefers-reduced-motion`).
- No topo, a contagem da sessão (zera ao recarregar) e o **total** salvo e
  descartado, com links para as abas de Vagas — para conferir o que já foi
  triado em sessões anteriores.
- Desfazer guarda as últimas 20 ações da sessão (pilha local) e volta a vaga
  exatamente como estava; ela reaparece como atual. A última ação fica numa
  linha "Salva: … · Desfazer" (sem aviso a cada vaga, para não poluir).
- A triagem é a mesma otimista da tela de Vagas: a vaga sai da caixa na hora,
  então a atual é sempre a primeira da lista. Tecla repetida rápido não manda
  a mesma vaga duas vezes; erro da API devolve a vaga e mostra o aviso.
- Com o painel de detalhe aberto, as setas não triam (atalhos ficam
  desligados com diálogo na frente ou digitando num campo — `useHotkeys`).
- Busca a próxima página quando faltam 5 cartões. Caixa vazia mostra
  "Tudo triado" e a hora da próxima busca.

### Candidaturas — `/candidaturas` e `/candidaturas/:id`

Dados: `GET /api/applications` (todas de uma vez, página a página — são
dezenas), `GET /api/applications/:id` no painel.

- Quadro: Aplicada · Em processo · Proposta · Encerradas (Recusada +
  Desisti). Cartão com título, empresa, status, "há X tempo" (última
  atualização) e a próxima etapa em destaque (só nas abertas).
- Mover de coluna registra um evento de status com a data de agora
  (`POST /applications/:id/events`), otimista no quadro. O aviso diz para onde
  foi ("Movida para Encerradas (Desisti).") e o "Desfazer" apaga o evento
  recém-criado. A data pode ser corrigida depois na linha do tempo.
  - **Arrastar** (`@dnd-kit/core`, mouse e toque): o arrasto só começa depois
    de 6 px, então clicar no título continua abrindo o detalhe. Soltar em
    Encerradas pergunta "A empresa recusou" ou "Eu desisti".
  - **Teclado**: o seletor "Mover para…" em cada cartão (o arrasto pelo
    teclado do dnd-kit move em pixels, ruim para colunas).
- Painel (`/candidaturas/:id`, `Esc` volta para `/candidaturas`):
  - status, data da candidatura, links "Ver vaga" (`/vagas?vaga=`) e site;
  - próxima etapa: marcar, editar e limpar (data/hora + o quê);
  - "Registrar etapa": status (sugere o próximo), quando aconteceu (não pode
    ser futuro — futuro é próxima etapa) e anotação;
  - linha do tempo do mais recente para o mais antigo, com "(antes: …)",
    editar data/anotação e apagar (o único evento não pode ser apagado);
  - dados do processo: onde se candidatou, pretensão e anotações;
  - "Apagar candidatura" pede um segundo clique em até 5 s. A vaga continua
    salva.
- Alternância Quadro / Lista (`?vista=lista`); a lista é uma tabela ordenável
  pelo cabeçalho (`aria-sort`).

### Currículo — `/curriculo` e `/curriculo/imprimir`

Dados: `GET /api/resume`. O modelo de dados do [04](04-resume.md) continua
igual; muda só a apresentação (formulário centralizado, como no job-tracker).

- Cabeçalho fixo no topo ao rolar (no celular, rola junto): "Copiar tudo"
  (mesmo texto do `/export`), "Ver e salvar PDF" e "Salvar". Embaixo do
  título, "N alterações não salvas · Ctrl+S salva".
- Caixa "Importar de PDF": **só visual nesta fase** — botão desabilitado com
  "Chega na Fase 3". O leitor de PDF é o item da Fase 3.
- Cada seção vira um cartão com "Copiar seção" e "Organizar":
  - `fields` → grade de 2 colunas, "Copiar" em cada campo. O valor é uma área
    de texto que cresce com o conteúdo (respostas longas cabem);
  - `text` → área de texto com contador de caracteres;
  - `entries` → cartões com título, organização · local · período e
    descrição, com "Copiar" e "Editar" (formulário no lugar, datas `AAAA-MM`,
    "Ainda estou aqui" limpa o fim).
- **Copiar um campo copia só o valor** (o formulário da vaga já tem o
  rótulo); vazio fica desabilitado. Copiar uma seção ou uma entrada usa
  `resumeItemToText`, o mesmo texto do `/export`. Copia o que está na tela,
  mesmo antes de salvar. O botão vira "Copiado" por 1,5 s.

**Quando cada mudança vai para a API**

| O quê                                                            | Quando                       |
| ---------------------------------------------------------------- | ---------------------------- |
| Conteúdo: valores, rótulos dos campos, textos, edição de entrada | Só no "Salvar" (ou `Ctrl+S`) |
| Estrutura: criar/apagar item ou seção, renomear seção, ordenar   | Na hora                      |

- O rascunho guarda o item inteiro por id. Item igual ao salvo (depois de
  aparar espaços, `undefined` × `null`) não conta como alteração.
- "Salvar" valida cada item com o schema do `shared` antes de enviar: item
  com erro não vai, o erro aparece no campo (a entrada abre sozinha) e os
  outros são salvos. Depois `PATCH /resume/items/:id`, **um de cada vez**;
  um que falhe não para os outros e continua no rascunho.
- Mudança de estrutura não mexe no rascunho (dá para adicionar um campo no
  meio da edição).
- Com algo não salvo: trocar de tela pergunta ("Salvar e sair", "Sair sem
  salvar", "Continuar editando"); fechar a aba ou recarregar, o navegador
  pergunta. `Ctrl+S` salva mesmo com o cursor num campo.
- "Organizar" mostra o que fica escondido no uso normal: renomear a seção,
  editar o rótulo dos campos, subir/descer/apagar itens e subir/descer/apagar
  a seção. Apagar pede o segundo clique em até 5 s.
- "Adicionar seção" no fim: nome e tipo (Campos, Texto, Entradas). O tipo não
  muda depois.

**Impressão — `/curriculo/imprimir`**

- Fora do layout do app (sem menu). Folha A4 em preto no branco nos dois
  temas; `@page` A4 com margem; painel de opções e avisos não saem no papel.
- "Salvar como PDF" chama `window.print()`; a dica lembra de escolher
  "Salvar como PDF" e desmarcar "Cabeçalhos e rodapés". O título da aba
  ("Currículo — Nome") vira o nome sugerido do arquivo.
- "Ver e salvar PDF" salva o rascunho antes de abrir; se algo não salvar,
  fica no formulário.
- Montagem: o campo que começa com "Nome" vira o título; as seções de campos
  que vêm **antes** de qualquer texto ou entrada (Dados pessoais, Contato,
  Links) viram uma linha de contato só com os valores; o resto vira um bloco
  por seção (campos como "Rótulo: valor"). Campo, seção ou entrada vazia não
  aparece.
- **O que entra**: caixas por seção e por campo. Por padrão fica de fora a
  seção "Respostas prontas" e os campos "Data de nascimento" e "Pretensão
  salarial" (em qualquer seção; comparação sem acento). A escolha fica no
  navegador (`busca-vagas:curriculo-pdf`), por id.

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
2. ✅ **Componentes de vaga**: `ScoreBadge`, `ReasonList`/`ReasonLine`,
   `JobChips`, `StackChips`, `StatusChip`, `Drawer` — com testes das faixas de
   nota. Vitrine com dados de exemplo em `/dev/componentes` (só no
   `pnpm dev:web`, fica fora do build).
3. ✅ **Vagas**: grade, filtros na URL, painel, triagem com desfazer, vaga manual.
4. ✅ **Deslizar**.
5. ✅ **Candidaturas**: quadro, mover de coluna, linha do tempo.
6. ✅ **Currículo**: formulário, copiar, salvar, impressão.
7. **Preferências**: formulário, fontes, histórico, limpeza.
8. **Início**: painel.

## Testes

- `lib/score.ts`: faixas nas bordas e motivos do cartão (bloqueio, a favor/contra, cobertura baixa).
- Triagem otimista: some na hora, volta com erro da API, desfazer chama `inbox`.
- Deslizar: setas, `Ctrl+Z`, busca a próxima página com 5 restantes.
- Currículo: copiar campo copia só o valor; salvar envia só o que mudou;
  item inválido não vai; `Ctrl+S`; aviso ao sair; o que entra no PDF.
- Tema: o atributo muda na raiz e a escolha fica salva.
- Acessibilidade: cada tela renderiza sem botão sem nome (checagem simples
  com Testing Library).

## Fora desta fase

Leitor de PDF do currículo, telas de E-mails e Métricas, empresas dos boards
editáveis pela tela e notificação de vaga nova — todos na Fase 3.
