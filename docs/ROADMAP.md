# Roadmap

Ordem de construção: **estrutura → backend → frontend → ajustes, melhorias e IA**.
Uma boa base de backend evita retrabalho; a IA fica para o final de propósito.

Legenda da origem das ideias: **JT** = arnaldoliro/job-tracker ·
**VA** = vihribeiro/vagas · **JS** = Gsync/jobsync · **CO** = santifer/career-ops ·
**VG** = leo-holanda/vagometro.

---

## Fase 0 — Estrutura ✅

- [x] Monorepo pnpm: `apps/api`, `apps/web`, `packages/shared`, `packages/sources`
- [x] Docker Compose com Postgres e Redis, só em `127.0.0.1`
- [x] NestJS com config validada (Zod), Prisma 7, BullMQ, `GET /api/health`
- [x] Segurança local: checagem de `Host` e de `Content-Type` em escrita
- [x] Contrato `JobSource`, cliente HTTP, `canonicalUrl`, `runSources` e pasta `_template`
- [x] Front mínimo mostrando o status da API
- [x] ESLint, Prettier, Vitest e CI no GitHub Actions
- [x] Gerar e versionar a primeira migration (`pnpm db:migrate --name init`)

## Fase 1 — Backend

Planos detalhados de cada feature: [`docs/features/`](features/README.md).

**Fontes** (uma pasta cada, em ordem de prioridade):

- [x] `gupy` — API pública por termo; cobre o mercado brasileiro (JT, CO, VG) ([05](features/05-discovery-gupy.md))
- [x] `greenhouse`, `lever`, `ashby` — boards por empresa, lista no `.env`, filtro de tecnologia e de local (JT, JS) ([06](features/06-company-boards.md))
- [ ] `github-issues` — repositórios de vagas como `backend-br/vagas` e `frontendbr/vagas`, via API oficial do GitHub (VG)
- [ ] `remote-boards` — RemoteOK e Remotive (JT)
- [x] Extração de stack, senioridade, modalidade e contrato por heurística (JT)

**Modelos e módulos:**

- [x] Base: contratos Zod compartilhados, pipe de validação, erros do Prisma → HTTP, cursor, testes de integração com Postgres real ([00](features/00-base.md))
- [x] `Job` com URL canônica `@unique`, CRUD manual e `ingest` para as fontes (JT) ([01](features/01-jobs.md))
- [x] Triagem salvar/descartar como campo da vaga — descartada nunca volta (JT) ([02](features/02-triage.md))
- [x] `Application` + `StatusEvent`: status derivado do histórico, data real do evento separada da data do registro (JT) ([03](features/03-applications.md))
- [x] `ResumeSection` + `ResumeItem`: currículo em blocos para copiar ("gaveta"), seções padrão e export em texto (VA) ([04](features/04-resume.md))
- [x] `Preferences`: stacks, senioridade, modalidade e cidades, contrato, idade máxima, salário, empresas bloqueadas ([07](features/07-preferences-score.md))
- [x] Processador da fila `source-scan`: um job por fonte, retry com backoff, registro em `SourceRun`
- [x] Varredura agendada (a cada 6 h) + manual (`POST /api/discovery/scan`)
- [x] `try`: rodar uma fonte de verdade e gravar a fixture real
- [x] Busca com filtros, paginação por cursor e exclusão de vagas descartadas (JT)
- [x] Nota de aderência **por código** (0–1000), normalizada pelos sinais disponíveis, com motivos e cobertura, calculada em segundo plano (JT) ([07](features/07-preferences-score.md))
- [x] Endpoint de saúde das fontes (últimas execuções, taxa de descarte)

**Próximo passo (08) — retenção e volume:**

- [ ] Vagas que não seguiram no processo seletivo ficam **1 mês** e depois são
      apagadas, para não pesar o banco nem a tela. A definir no plano: o que
      conta como "não seguiu" (descartada? caixa de entrada sem ação? candidatura
      recusada/desistida?) e o que guardar para a vaga apagada **não voltar** na
      próxima varredura (hoje a linha da vaga é o que impede isso — ver 02).
- [ ] Paginação no banco já existe (cursor em `/api/jobs`); revisar limites e
      as demais listagens; no frontend, na Fase 2.

## Fase 2 — Frontend

- [ ] Lista de vagas com filtros, salvar e descartar (com desfazer)
- [ ] **Modo deslizar**: direita = salvar, esquerda = descartar, setas do teclado, desfazer (VA)
- [ ] Detalhe da vaga com nota, motivos e stack detectada
- [ ] Candidaturas: quadro por status e linha do tempo
- [ ] **Gaveta do currículo**: blocos com botão de copiar e edição no lugar (VA)
- [ ] Preferências de busca e lista de empresas acompanhadas (hoje no `.env`: `*_COMPANIES`)

## Fase 3 — Ajustes e melhorias

- [ ] Portais BR sem API via JSON-LD (`schema.org/JobPosting`): InfoJobs, Vagas.com (JT)
- [ ] Notificação de vaga nova com nota alta (JS)
- [ ] Checagem se a vaga ainda está aberta antes de candidatar (CO)
- [ ] Detecção de vaga repostada (VG)
- [ ] Importar currículo de PDF, com revisão antes de salvar (VA, JS)
- [ ] Versão do currículo congelada em cada candidatura (JT)
- [ ] Painel: funil, tempo até a primeira resposta, rendimento por fonte (JT)
- [ ] Estatísticas do mercado com as vagas coletadas: stacks mais pedidas etc. (VG)
- [ ] Banco de perguntas de entrevista com as suas respostas (JS)
- [ ] Backup / exportação dos dados (JS)
- [ ] Diretório embutido de empresas por ATS (JS)
- [ ] Extensão do Chrome: enviar vaga do LinkedIn para o app, sem scraping (VA)
- [ ] Alertas de vaga do LinkedIn lidos do e-mail (IMAP com rótulo) (JT)
- [ ] Preencher formulário com Playwright, **nunca enviar** (JT)
- [ ] Docker Compose completo (API + web em container) para quem só quer usar

## Fase 4 — IA (guardada para o final)

**Princípios**

- O código ordena todas as vagas; a IA analisa só as do topo ou a que você abriu (JS).
- A IA sugere, você decide: nenhuma sugestão vira dado sem o seu clique (JT).
- Saída sempre estruturada (JSON Schema) e validada com Zod; resposta inválida é descartada.
- Nunca inventar experiência: só o que está no currículo, citando o trecho (JT).

**Arquitetura:** interface `LlmProvider` com adaptadores trocáveis pelo `.env` —
`ollama` (padrão), `groq`, `zai` (GLM) e, depois, `anthropic` (Claude). Fila
`ai-analysis` com concorrência 1 para o modelo local e limite de taxa para as
APIs gratuitas.

**Usos planejados**

- Motivos e dicas da nota nas vagas do topo (VA)
- Análise de lacunas: o que a vaga pede que o currículo não mostra
- Extração de vaga a partir de link colado, quando não houver JSON-LD (JT)
- Rascunho de respostas abertas e carta de apresentação (JT)
- Pesquisa sobre a empresa antes da entrevista

**Modelos a avaliar** (hardware de referência: RTX 3060 12 GB + 32 GB RAM;
nomes de outubro/2026 — reconfirmar no catálogo do Ollama quando chegar a hora)

| Modelo                  | Onde roda                              | Observação                                                    |
| ----------------------- | -------------------------------------- | ------------------------------------------------------------- |
| `qwen3.5:9b`            | Inteiro na GPU (Q4/Q6)                 | Candidato a padrão; desligar o "thinking" em extração         |
| Gemma 4 12B             | Inteiro na GPU (Q4)                    | Alternativa forte em tarefas estruturadas                     |
| gpt-oss-20b             | GPU + parte na RAM                     | Citado como bom em saída estruturada                          |
| `qwen3.6:35b-a3b` (MoE) | GPU + RAM (offload)                    | Mais inteligente, mais lento — bom para lote em segundo plano |
| GLM-4.7-Flash (30B-A3B) | Offload local, ou API gratuita da Z.ai | Ler a política de dados antes de enviar currículo             |
| Groq (Llama/Qwen)       | Nuvem, cota gratuita                   | Não retém dados por padrão; ótimo se o PC estiver ocupado     |

Cuidados no Ollama: contexto padrão de 4K abaixo de 24 GB de VRAM (ajustar
`num_ctx`); usar o parâmetro `format` com JSON Schema; `think: false` em tarefas
de extração.

**Antes de escolher:** script de avaliação no repositório — ~20 vagas reais +
o currículo, a mesma tarefa em cada modelo, medindo JSON válido, tempo e
qualidade. Benchmarks divulgados pelos fabricantes não substituem esse teste.
