# 21 — Extensão do Chrome

Você está vendo uma vaga no navegador e quer ela no app: clica no ícone da
extensão, confere o formulário e manda para a Caixa (ou já salva). Funciona
em qualquer site, inclusive nos que o app não acessa sozinho.

## Decisões

- **Depende do site:**
  - **LinkedIn, Indeed, Glassdoor, InfoJobs e Vagas.com** (os termos deles
    proíbem programas e extensões que leem as páginas): a extensão **não lê a
    página**. Usa só o link e o título da aba, que é o próprio navegador que
    informa. O resto (local, modalidade, data, descrição) vem do **texto que
    você copia** da página e cola na janelinha: quem lê a página é você.
    Detalhes em [Texto colado](#texto-colado).
  - **Os outros** (Gupy, sites de carreira, ATS): lê os dados estruturados
    `schema.org/JobPosting` (JSON-LD) que a própria página publica para
    buscadores como o Google. Título, empresa, local, contrato, data, salário e
    descrição vêm preenchidos. Sem JSON-LD, usa o título da aba e o nome do site.
- **Janelinha para conferir:** nada é mandado sem você clicar em "Mandar para
  a Caixa" ou "Salvar".
- **Repetida:** ao abrir, a extensão pergunta ao app se a vaga já está lá
  (pelo link e pela mesma empresa + título + lugar vinda de outra fonte). Se
  estiver, mostra o estado ("Salva · nota 720", "Você já se candidatou") e o
  botão "Abrir no app", sem formulário.
- **Só a sua máquina:** a extensão só tem permissão para falar com
  `127.0.0.1` e `localhost`. Não manda nada para outro lugar e não guarda nada
  além do endereço do app.
- **Mesmo repositório** (`apps/extension`): usa os mesmos formatos de vaga do
  `packages/shared` e entra no lint, typecheck e testes de sempre.

## Instalar (uma vez)

1. Compile: `pnpm install` e depois `pnpm ext:build`. Sai a pasta
   `apps/extension/dist`.
2. No Chrome, abra `chrome://extensions`, ligue o **Modo do desenvolvedor**
   (canto superior direito) e clique em **Carregar sem compactação**.
3. Escolha a pasta `apps/extension/dist`.
4. Fixe o ícone (o quebra-cabeça na barra → alfinete ao lado de BuscaVagas).

Depois de atualizar o código, rode `pnpm ext:build` de novo e clique no ↻ da
extensão em `chrome://extensions`.

O app precisa estar rodando. A extensão procura em `127.0.0.1:8080` (modo
Docker) e `127.0.0.1:3333` (modo dev). Em outra porta, ela pergunta o
endereço na primeira vez e guarda.

## Usar

1. Abra a página de uma vaga.
2. Clique no ícone do BuscaVagas.
3. Confira título, empresa, local e modalidade. O link vem na forma "de uma
   vaga": no LinkedIn, mesmo com a vaga aberta na lista
   (`?currentJobId=...`), vai `linkedin.com/jobs/view/<id>`, o mesmo link que
   o alerta por e-mail usa ([20](20-email-alerts.md)). Assim a mesma vaga não
   entra duas vezes.
4. Nos sites restritos (e nos que não publicam os dados da vaga), abra
   "Colar o texto da vaga" e cole o texto da página (veja abaixo).
5. "Mandar para a Caixa" ou "Salvar". "Abrir no app" leva para a vaga no app.

A vaga entra como cadastro manual (filtro "Fonte" → "Cadastro manual"), com a
nota calculada como as outras.

## Texto colado

O título da aba do LinkedIn só traz título e empresa
("Título | Empresa | LinkedIn"). Para o resto:

1. Na página da vaga, selecione do nome da empresa até o fim de "Sobre a
   vaga" e copie (Ctrl+C). Copiar a página inteira (Ctrl+A) também serve.
2. Na janelinha, cole em "Colar o texto da vaga". Ela mostra o que achou
   ("Do texto: local, modalidade, data (há 1 mês) e descrição").

Do texto saem:

| Campo      | De onde                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| Local      | a linha "Brasil · há 1 semana · ..." (também "Empresa · Local · há...") |
| Data       | "há 3 dias", "há 1 mês", "Republicada há 2 semanas", "3 days ago"       |
| Modalidade | as etiquetas depois dessa linha ("Remoto", "Híbrido", "Presencial")     |
| Contrato   | etiqueta "Estágio" / "Temporário"; ou só CLT ou só PJ na descrição      |
| Salário    | "R$ 3.000/mês - R$ 4.000/mês", "Salário: R$ 4 mil" na descrição         |
| Descrição  | de "Sobre a vaga" (ou "About the job") até "Sobre a empresa"            |
| Título     | as duas linhas acima da do local, só se o campo estiver vazio           |

- Preenche só o que está vazio (ou o que um texto colado antes preencheu): o
  que você digitou fica.
- Com a descrição, o app deduz stack e senioridade ([01](01-jobs.md)), e a
  nota da vaga fica mais certa.
- A linha "local · data" usada é a mais perto de "Sobre a vaga": com a página
  inteira, as outras vagas da lista ficam de fora.

## O que a extensão lê

| Onde              | O que lê                                                         | Como                              |
| ----------------- | ---------------------------------------------------------------- | --------------------------------- |
| Sites restritos   | link e título da aba; o texto que você colar                     | API do navegador (`chrome.tabs`)  |
| Outros sites      | o mesmo + `<script type="application/ld+json">` e `og:site_name` | uma leitura, só quando você clica |
| App (`127.0.0.1`) | `GET /api/health`, `GET /api/jobs/lookup`, `POST /api/jobs`      | `fetch`                           |

Permissões no `manifest.json`: `activeTab` (só a aba aberta, só depois do
clique), `scripting` (a leitura do JSON-LD), `storage` (o endereço do app) e
acesso a `http://127.0.0.1/*` e `http://localhost/*`. Nenhuma permissão para
os sites das vagas.

## API

- `GET /api/jobs/lookup?url=&title=&company=&location=` →
  `{ match: 'link' | 'same' | null, job, openUrl }`.
  - `link`: o link (já na forma "de uma vaga") é o de uma vaga ou um dos
    outros links dela;
  - `same`: com título e empresa, a mesma impressão
    ([11](11-reposts.md)) de uma vaga vista nos últimos dias;
  - `openUrl`: a vaga no app (`WEB_ORIGIN/vagas?vaga=<id>`).
- `POST /api/jobs` aceita `triage: 'saved'` (padrão: caixa). O link passa
  pela mesma normalização (`siteJobUrl`, em `packages/shared/src/capture.ts`),
  então colar um link de lista do LinkedIn em "Vaga manual" também vira o link
  da vaga.

A lista de sites restritos (`RESTRICTED_SITES`) agora fica no `shared`: a
extensão e a conferência "ainda está aberta?" ([13](13-availability.md))
usam a mesma.

## Código

`apps/extension/`:

| Arquivo                | O que faz                                                         |
| ---------------------- | ----------------------------------------------------------------- |
| `public/manifest.json` | Manifest V3: janelinha, ícones e permissões                       |
| `src/main.ts`          | Liga a janelinha às APIs do Chrome                                |
| `src/popup.ts`         | Telas: lendo, já está no app, formulário, mandada, app fora do ar |
| `src/page.ts`          | O que ler de cada aba (restrito: nada da página)                  |
| `src/jsonld.ts`        | `JobPosting` → rascunho                                           |
| `src/tab-title.ts`     | Palpite de título, empresa e local pelo título da aba             |
| `src/pasted-text.ts`   | Texto colado → local, modalidade, data, salário e descrição       |
| `src/app-client.ts`    | Acha o app (8080 / 3333 / o salvo) e chama a API                  |

`popup.html?aba=<id>` abre a janelinha numa aba apontando para outra aba. Só
serve para testar: no uso normal ela pega a aba ativa.

## Testes

- `apps/extension/src/parsing.spec.ts`: JSON-LD (campos, `@graph`, listas,
  JSON quebrado, sem vaga), títulos de aba do LinkedIn (com "|" e "–" no
  título), Indeed e Glassdoor, texto colado (LinkedIn, página inteira, formato
  antigo em inglês, texto sem dados), rascunho → corpo do POST, endereços
  aceitos, link da vaga no app.
- `apps/extension/src/popup.spec.ts`: LinkedIn não lê a página e manda já
  salva com o link "de uma vaga"; JSON-LD preenche e manda para a Caixa; já
  está no app (mesma vaga de outra fonte, candidatura); campos faltando; app
  fora do ar e endereço salvo; página que não é site; texto colado preenche
  local, modalidade, contrato, data e descrição sem mexer no título que você
  corrigiu.
- `packages/shared/src/capture.spec.ts`: sites restritos e `siteJobUrl`.
- `jobs.int.spec.ts`: criar já salva; link de lista do LinkedIn; lookup pelo
  link, por outro link da mesma vaga e pela impressão; stack e senioridade
  deduzidas quando em branco.
- Conferido de ponta a ponta no Chromium com a extensão carregada: página com
  JSON-LD → formulário preenchido → "Mandar para a Caixa" → a vaga no banco
  com salário, data e descrição → abrir de novo mostra "Já está no app".
