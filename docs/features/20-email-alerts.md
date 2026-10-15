# 20 — Alertas de vaga por e-mail

LinkedIn, Indeed e Glassdoor não permitem que programas acessem os sites
deles (ver [ROADMAP](../ROADMAP.md), "Portais que não permitem coleta"). Mas
eles mesmos mandam as vagas para você por e-mail. O app lê esses alertas
**no seu e-mail**, num marcador próprio, e as vagas entram como as das outras
fontes: nota, aviso no sino, junção com a mesma vaga vinda de outro lugar.

O app **nunca** acessa LinkedIn, Indeed ou Glassdoor, nem para ver se a vaga
ainda está aberta. Os links ficam guardados para você abrir.

## Decisões

- **Só o marcador `BuscaVagas`.** Um filtro do Gmail põe os alertas lá; o app
  não abre o resto da sua caixa.
- **Só leitura, de verdade.** O marcador é aberto com `EXAMINE` (o servidor não
  deixa mudar nada) e os e-mails são baixados com `BODY.PEEK` (não marca como
  lido). O app não marca, não move e não apaga e-mail.
- **A cada hora** (`EMAIL_INTERVAL_MINUTES`, padrão 60), mais o "Buscar agora".
  Esse intervalo é só do e-mail: `DISCOVERY_INTERVAL_HOURS=0` desliga as
  outras fontes, não esta.
- **Últimos 3 dias** a cada leitura (`EMAIL_LOOKBACK_DAYS`). O filtro é feito
  no próprio servidor (`SEARCH SINCE`): e-mails mais antigos nem são baixados.
  Cada e-mail é baixado uma vez por execução da API; depois, as vagas dele vêm
  da memória.
- **Vaga com mais de 30 dias não entra** (`EMAIL_MAX_AGE_DAYS`): um alerta
  recente pode trazer vaga publicada há muito tempo ("30d+"). Conta como
  "filtrada" no histórico. Vaga sem idade no alerta (LinkedIn) entra. A
  migration `20261021120000_drop_old_email_jobs` apagou, uma vez, as que já
  tinham entrado (menos salvas e com candidatura).
- **Filtro "Fonte"** na tela de Vagas: "Alertas por e-mail", um site só ou
  "Tudo menos e-mail".
- **Senha só no `.env`**, que não vai para o git. No Gmail, é uma "senha de
  app", não a senha da conta. O app nunca mostra nem registra a senha.

## Configurar no Gmail (uma vez)

1. **Verificação em duas etapas.** Em [myaccount.google.com](https://myaccount.google.com)
   → Segurança, ative a verificação em duas etapas (sem ela o Google não
   deixa criar senha de app).
2. **Senha de app.** Em [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords),
   crie uma com o nome `BuscaVagas`. O Google mostra 16 letras, uma vez só.
3. **Marcador e filtro.** No Gmail, na busca, clique em "Mostrar opções de
   pesquisa" e ponha em **De**:

   ```
   jobs-noreply@linkedin.com OR jobalerts-noreply@linkedin.com OR jobalert.indeed.com OR noreply@glassdoor.com
   ```

   "Criar filtro" → marque **Aplicar o marcador** → "Novo marcador…" →
   `BuscaVagas`. Marque também **Aplicar o filtro às conversas
   correspondentes**, para os alertas que já chegaram. Se quiser, "Pular a
   Caixa de entrada".

   O filtro pega só o remetente das vagas do LinkedIn: conexões, posts e
   notícias vêm de outros endereços e ficam fora do marcador.

4. **`.env`** (na raiz do projeto):

   ```
   EMAIL_USER=seu.email@gmail.com
   EMAIL_PASSWORD=abcd efgh ijkl mnop
   ```

   Pode colar a senha de app com os espaços; o app tira.

5. **Reinicie a API** (`pnpm dev:api`, ou `pnpm app:up` no modo Docker). Em
   Preferências → Fontes aparece **Alertas por e-mail**; "Buscar agora" lê na
   hora.

O IMAP do Gmail fica sempre ligado. Em conta de empresa (Google Workspace), o
administrador pode ter bloqueado senha de app ou IMAP.

### Outros provedores

Qualquer e-mail com IMAP serve. Ajuste `EMAIL_IMAP_HOST` (ex.:
`outlook.office365.com`), `EMAIL_IMAP_PORT` (padrão 993, sempre com TLS) e
`EMAIL_FOLDER` (o nome da pasta). Nesses provedores a senha fica exatamente
como foi escrita.

## O que sai de cada alerta

| Site      | Link guardado                              | Id da vaga               | Também vem                                      |
| --------- | ------------------------------------------ | ------------------------ | ----------------------------------------------- |
| LinkedIn  | `linkedin.com/jobs/view/<id>`              | o do LinkedIn            | local e modalidade ("São Paulo, SP (Híbrido)")  |
| Indeed    | o link do e-mail (`engage.indeed.com/...`) | empresa + título + local | local, salário (se houver), resumo, "há N dias" |
| Glassdoor | `glassdoor.com.br/job-listing/j?jl=<id>`   | o do Glassdoor           | local, salário estimado, "N dia(s)"             |

- **Sem descrição completa:** os alertas trazem título, empresa e local (o
  Indeed, um resumo de duas linhas). A nota usa o que há; o que falta conta
  como meio-termo ([07](07-preferences-score.md)), então uma vaga de alerta
  que bate em tudo fica perto de 750–800, não em 1000, e não enche o sino.
- **Indeed:** o link do e-mail é de rastreio e muda a cada envio. O app
  identifica a vaga por empresa + título + local, e a mesma vaga em outro
  e-mail não vira outra (a gravação procura pela fonte + id antes do link).
  Esse link é pessoal: o próprio Indeed pede para não compartilhar.
- **"Há N dias"** vira a data de publicação, contada do envio do e-mail.
- **"Trabalho remoto" / "Remoto"** no lugar do local é a modalidade: a vaga
  fica remota e sem cidade.
- **A vaga do cabeçalho** do LinkedIn ("Vagas semelhantes à de X") é uma
  que você já viu: não entra.
- A mesma vaga num alerta e numa busca da Gupy ou de um board vira uma vaga
  só, com o outro link ("Também na ...", [11](11-reposts.md)). O e-mail é a
  última fonte do registro: a vaga fica com os dados mais completos da outra.

## O que é ignorado

Cada leitura registra no log quantos e-mails havia no marcador e o que foi
ignorado:

- **de outro remetente:** não é LinkedIn, Indeed nem Glassdoor;
- **sem vaga:** e-mail do LinkedIn sem cartão de vaga (conexão, post, notícia);
- **sem confirmação do remetente:** o `Authentication-Results` que o **seu**
  provedor escreveu não confirma (DKIM ou DMARC) que o e-mail veio do domínio
  do site. Protege contra e-mail falso com "From: LinkedIn" pondo vaga no app.
  Provedor que não escreve esse cabeçalho: não dá para saber, e o e-mail é lido.

## Ainda está aberta?

Para LinkedIn, Indeed e Glassdoor o app não confere (nem com uma requisição):
o painel diz "Este site não permite conferência automática: abra o link para
ver". O prazo e a limpeza ([08](08-retention.md)) funcionam normalmente:
vaga que não aparece em nenhum alerta por 30 dias sai da caixa.

## Erros

Aparecem em Preferências → Fontes, na linha do e-mail:

| Mensagem                                     | O que fazer                                            |
| -------------------------------------------- | ------------------------------------------------------ |
| "O e-mail recusou o login de ..."            | Confira `EMAIL_USER` e `EMAIL_PASSWORD` (senha de app) |
| "Não achei o marcador "BuscaVagas" ..."      | Crie o marcador (passo 3) ou ajuste `EMAIL_FOLDER`     |
| "Não consegui conectar em imap.gmail.com..." | Internet, firewall ou `EMAIL_IMAP_HOST`                |

Sem `EMAIL_USER` e `EMAIL_PASSWORD`, a fonte aparece desligada, com o motivo.

## Configuração (`.env`)

| Variável                 | Padrão           | O que é                                             |
| ------------------------ | ---------------- | --------------------------------------------------- |
| `EMAIL_USER`             | —                | Seu e-mail                                          |
| `EMAIL_PASSWORD`         | —                | Senha de app (Gmail) ou do IMAP                     |
| `EMAIL_FOLDER`           | `BuscaVagas`     | Marcador/pasta dos alertas                          |
| `EMAIL_INTERVAL_MINUTES` | `60`             | 0 = só pelo botão; de 15 a 1440                     |
| `EMAIL_LOOKBACK_DAYS`    | `3`              | Quantos dias para trás ler (1 a 30)                 |
| `EMAIL_MAX_AGE_DAYS`     | `30`             | Vaga mais velha que isso não entra (0 = sem limite) |
| `EMAIL_IMAP_HOST`        | `imap.gmail.com` | Servidor IMAP                                       |
| `EMAIL_IMAP_PORT`        | `993`            | Porta (TLS)                                         |

## Código

- `packages/sources/src/email/`: a fonte (`email.source.ts`), a leitura do
  IMAP (`mailbox.ts`, `imapflow`), o MIME (`message.ts`, `postal-mime`) e um
  leitor por site em `sites/`. Os leitores andam pelo texto do HTML na ordem
  ("o título é um link para a vaga; logo depois vêm empresa e local"), sem
  depender das classes, que mudam a cada envio. O LinkedIn tem o texto puro
  como reserva.
- API: o agendador aceita intervalo por fonte (`scheduleEveryMs`); a gravação
  (`JobsService.ingest`) reconhece a mesma vaga por fonte + id quando o link
  muda.
- Web: as vagas mostram "via LinkedIn", "via Indeed", "via Glassdoor".

## Testes

- `email.spec.ts`, com alertas reais **anonimizados** em `__fixtures__/`
  (nome, e-mail e links de rastreio trocados; vagas e empresas são públicas):
  - LinkedIn "vagas semelhantes" (10 vagas, sem a do cabeçalho; mesma vaga
    em duas cidades), sugestões, texto puro, notificação sem vaga;
  - Indeed (10 vagas, local, resumo, data; id que não depende do link);
  - Glassdoor (13 vagas, nota ignorada, salário estimado, selos);
  - remetente desconhecido, falso (DKIM de outro domínio) e o cabeçalho de
    baixo forjado;
  - "ainda está aberta?" não faz nenhuma requisição para os três sites;
  - a fonte: janela de dias, cada e-mail baixado uma vez, e-mail que sai da
    janela, a mesma vaga em dois alertas, erro do IMAP;
  - configuração e mensagens de erro (sem a senha).
- `reposts.int.spec.ts`: mesma fonte + id com outro link é a mesma vaga.
- `discovery.scheduler.spec.ts`: o e-mail no próprio intervalo.
