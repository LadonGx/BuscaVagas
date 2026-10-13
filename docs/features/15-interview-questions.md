# 15 — Perguntas de entrevista

Tela **Entrevistas**: um banco com as perguntas que caem em entrevista e as
suas respostas, ligado às candidaturas e com um modo de treino.

## Decisões

- **Resposta em texto livre + STAR opcional.** Toda pergunta tem categoria
  (RH, Comportamental, Técnica, Sobre a empresa), tags e a resposta em texto.
  Nas comportamentais, os campos Situação, Tarefa, Ação e Resultado já vêm
  abertos (em qualquer pergunta dá para abrir).
- **"Caiu nesta entrevista".** No painel da candidatura você marca o que
  perguntaram e anota como foi. Na pergunta aparece em quais processos ela
  caiu.
- **Começa com ~30 perguntas comuns** de entrevista de dev júnior no Brasil,
  sem resposta (`interview-seeds.ts`). Entram uma vez só (flag
  `interview-seeds`); apagar não as traz de volta.
- **Treino simples:** uma pergunta por vez, você responde em voz alta, mostra
  a sua resposta e marca "fui bem" ou "preciso treinar". As de "preciso
  treinar" aparecem mais.
- **Sem IA aqui.** Rascunho de resposta com IA fica para a Fase 4.
- **Lista inteira de uma vez** (dezenas de perguntas): busca e filtros
  rodam na tela, sem ir à API.

## Dados

| Modelo              | Campos                                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `InterviewQuestion` | `question`, `category`, `tags[]`, `answer`, `starSituation/Task/Action/Result`, `practiceCount`, `lastRating`, `practicedAt`, `seeded` |
| `InterviewAsked`    | `questionId`, `applicationId` (único por par), `note`, `askedAt` — some junto com a pergunta ou a candidatura (`Cascade`)              |

Migração `20261015120000_interview_questions` (rode `pnpm db:deploy`).

Regras (em `packages/shared/src/interviews.ts`):

- tags em minúsculas, sem repetição, até 10 (`"React , react"` → `react`);
- texto vazio vira `null`; **respondida** = texto ou algum campo STAR;
- **para treinar** = a última avaliação no treino foi "preciso treinar".

## API

| Método   | Rota                                                | O que faz                                                          |
| -------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| `GET`    | `/api/interview-questions`                          | todas, na ordem de criação, com onde caíram                        |
| `POST`   | `/api/interview-questions`                          | cria; `askedIn: <candidatura>` já marca "caiu nesta entrevista"    |
| `GET`    | `/api/interview-questions/:id`                      | uma                                                                |
| `PATCH`  | `/api/interview-questions/:id`                      | edita (`null` ou texto vazio limpa); corpo vazio = 400             |
| `DELETE` | `/api/interview-questions/:id`                      | apaga (e as marcas nas candidaturas)                               |
| `POST`   | `/api/interview-questions/:id/practice`             | `{ rating: "good" \| "again" }` — conta a vez e guarda a avaliação |
| `PUT`    | `/api/interview-questions/:id/asked/:applicationId` | marca na candidatura; de novo, troca a anotação (`{ note }`)       |
| `DELETE` | `/api/interview-questions/:id/asked/:applicationId` | desmarca                                                           |

## Treino

`pickPracticeQuestion` sorteia pelo peso, sem repetir na sessão (vistas
todas, recomeça):

| Situação                     | Peso |
| ---------------------------- | ---- |
| "preciso treinar"            | 6    |
| nunca treinada               | 4    |
| "fui bem" há 14 dias ou mais | 2    |
| "fui bem" entre 3 e 14 dias  | 1    |
| "fui bem" há menos de 3 dias | 0,5  |

## Tela

- **Entrevistas** (`/entrevistas`, no menu entre Candidaturas e Currículo):
  - "N perguntas · N respondidas · N para treinar"; botões **Nova pergunta**
    e **Treinar** (leva a categoria e a tag filtradas);
  - busca (pergunta, resposta, STAR e tags, sem acento), categorias com
    contagem, situação (sem resposta, respondidas, para treinar) e tag
    (clique numa tag do cartão) — tudo na URL (`busca`, `categoria`,
    `situacao`, `tag`);
  - cartão: pergunta, começo da resposta (ou "Sem resposta ainda"),
    categoria, "Para treinar", "Caiu em N processos" e as tags;
  - editor no painel (`?pergunta=<id>` ou `?pergunta=nova`): pergunta,
    categoria, tags, sua resposta, STAR, onde caiu (com a anotação) e o
    treino. Fechar com alteração não salva pergunta antes; apagar pede
    confirmação.
- **Treino** (`/entrevistas/treino`): filtros de categoria, "só as que preciso
  treinar" e tag; **Mostrar minha resposta** (Espaço), **Preciso treinar** (1),
  **Fui bem** (2), **Pular**; placar da sessão no subtítulo. Pergunta sem
  resposta: "Escrever agora" abre o editor.
- **Painel da candidatura → "Perguntas da entrevista"**: as que caíram (link
  para o editor), "Anotar como foi" / "Editar anotação", tirar; campo "Qual
  pergunta fizeram?" busca no banco (clique marca) ou, se não existe,
  **Adicionar como pergunta nova** com a categoria escolhida.

## Testes

- Shared: tags; texto vazio vira `null`; PATCH vazio; respondida; pesos do
  treino; sorteio pelo peso, sem repetir e recomeçando.
- API: lista inicial uma vez só, na ordem, e não volta depois de apagada;
  criar/editar/limpar com tags normalizadas e STAR; validação; treino;
  marcar, anotar, remarcar (sem duplicar) e desmarcar; criar já marcada;
  apagar candidatura tira a marca; apagar pergunta leva as marcas; 404.
- Tela: contagens e filtros (categoria, situação, tag, busca) na URL;
  editar com STAR e salvar; pergunta antes de descartar; criar, abrir e
  apagar; treino (resposta, tecla, avaliação, placar), sem resposta, "só as
  que preciso treinar" vazio; painel da candidatura (anotar, marcar do banco,
  criar nova, tirar); filtro e sugestões sem acento.
