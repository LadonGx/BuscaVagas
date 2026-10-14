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
- [x] `greenhouse`, `lever`, `ashby` — boards por empresa (lista editada na tela desde a Fase 3), filtro de tecnologia e de local (JT, JS) ([06](features/06-company-boards.md))
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

**Retenção e volume** ([08](features/08-retention.md)):

- [x] Descartadas e caixa esquecida (a fonte não traz mais) saem depois de 30 dias
      (`RETENTION_DAYS`), numa limpeza diária com prévia; salvas, com candidatura e
      manuais na caixa ficam
- [x] URL da descartada apagada é lembrada (`ForgottenJob`, 6 meses) para a vaga não voltar
- [x] Paginação por cursor em todas as listagens (`/jobs`, `/applications`, `/discovery/runs`)

## Fase 2 — Frontend

Planos: [09 — dados para as telas](features/09-screen-data.md) e
[10 — frontend](features/10-frontend.md). Tema Noite violeta, escuro e claro.

- [x] Rotas que as telas pedem: contagens, `hasApplication`, próxima busca, painel ([09](features/09-screen-data.md))
- [x] Base: menu, tema escuro/claro, rotas, cliente da API, avisos
- [x] **Início**: atalhos, melhores vagas novas, próximas etapas, vagas por dia, funil (JS)
- [x] Vagas em cartões com filtros, salvar e descartar (com desfazer) e painel de detalhe com nota e motivos
- [x] **Modo deslizar**: direita = salvar, esquerda = descartar, setas do teclado, desfazer (VA)
- [x] Candidaturas: quadro por status e linha do tempo
- [x] **Currículo** em formulário com copiar por campo, "Ver e salvar PDF" e a caixa de importar PDF (só visual) (JT)
- [x] Preferências de busca, estado das fontes e prévia da limpeza

## Fase 3 — Ajustes e melhorias

Ordem combinada, em blocos.

**Bloco A — mais vagas, menos repetidas**

- [x] Empresas dos boards editáveis na tela (Preferências → Fontes) + diretório embutido de
      empresas verificadas por ATS; o `.env` só semeia a primeira vez (JS) ([06](features/06-company-boards.md))
- [x] Portais BR (InfoJobs, Vagas.com) e grandes (Indeed, Glassdoor, LinkedIn): termos de uso
      conferidos — todos proíbem coleta automática. Caminhos permitidos abaixo.
- [x] Detecção de vaga repostada e da mesma vaga em duas fontes: selo, histórico e
      "descartar sozinha se for repostada" (VG) ([11](features/11-reposts.md))

**Bloco B — candidatura**

- [x] Importar currículo de PDF (lido no navegador, só completa o que está vazio), com
      revisão antes de salvar (VA, JS) ([12](features/12-resume-import.md))
- [x] A vaga ainda está aberta? Board da empresa, prazo da Gupy, botão no painel e
      conferência diária das salvas; selo "Encerrada" e "Esconder encerradas" (CO)
      ([13](features/13-availability.md))
- [x] Currículo de cada candidatura: cópia do currículo do app no "Me candidatei", PDF
      enviado anexado, ver/imprimir e comparar com o atual (JT)
      ([14](features/14-resume-versions.md))
- [x] Banco de perguntas de entrevista: resposta livre ou STAR, ~30 perguntas comuns para
      começar, "caiu nesta entrevista" no painel da candidatura e modo treino (JS)
      ([15](features/15-interview-questions.md))

**Bloco C — acompanhar**

- [x] Aviso de vaga nova com nota alta: sino no app (um aviso por busca, nota mínima
      ajustável em Preferências) (JS) ([16](features/16-notifications.md))
- [ ] Tela de Métricas: rendimento por fonte, stacks mais pedidas, tempo até a resposta (JT, VG)

**Bloco D — uso no dia a dia**

- [ ] Backup / exportação dos dados (JS)
- [ ] Docker Compose completo (API + web em container) para quem só quer usar
- [ ] Alertas de vaga por e-mail (IMAP, só leitura, num marcador do Gmail): LinkedIn,
      Glassdoor e Indeed mandam título, empresa, local e link (JT)
- [ ] Extensão do Chrome: enviar a vaga aberta no navegador para o app, sem scraping (VA)
- [ ] Preencher formulário com Playwright, **nunca enviar** (JT)
- [ ] Aviso de nota alta também no celular (ntfy ou Telegram), com horário de silêncio
      (22h–8h, ajustável) — o sino já guarda os avisos; falta só o canal ([16](features/16-notifications.md))

**Último passo:** sites de carreira de grandes empresas (iFood, Bosch, Mercado Livre,
IBM…), cada um com o próprio formato — depois de tudo acima.

**Portais que não permitem coleta** (pesquisa de outubro/2026):

| Portal    | O que os termos dizem                                   | Caminho permitido                          |
| --------- | ------------------------------------------------------- | ------------------------------------------ |
| InfoJobs  | Proíbe acesso por robôs; `robots.txt` bloqueia as vagas | Alerta por e-mail; extensão; "Vaga manual" |
| Vagas.com | Proíbe software que interfira e reprodução do conteúdo  | Alerta por e-mail; extensão; "Vaga manual" |
| Indeed    | Proíbe crawl/scrape; API de publisher encerrada em 2024 | Alerta por e-mail; extensão; "Vaga manual" |
| Glassdoor | Proíbe agentes automáticos e extração                   | Alerta por e-mail; extensão; "Vaga manual" |
| LinkedIn  | Pede permissão expressa; API só para parceiros          | Alerta por e-mail; extensão; "Vaga manual" |

"Vaga manual" = colar o link; quando a página tem JSON-LD (`schema.org/JobPosting`),
os campos podem vir preenchidos — é você abrindo a página, não um robô.

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
