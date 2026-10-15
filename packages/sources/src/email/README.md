# Alertas por e-mail (`email`)

Lê, só lê, os alertas de vaga do LinkedIn, Indeed e Glassdoor num marcador do
seu e-mail (IMAP). Nunca acessa os sites. Plano, configuração do Gmail e
decisões: [`docs/features/20-email-alerts.md`](../../../../docs/features/20-email-alerts.md).

| Arquivo           | O que faz                                                         |
| ----------------- | ----------------------------------------------------------------- |
| `email.source.ts` | A fonte: janela de dias, cache por e-mail, junta as vagas         |
| `mailbox.ts`      | IMAP só leitura (`EXAMINE` + `BODY.PEEK`), erros em PT-BR         |
| `message.ts`      | MIME → remetente, data, texto, HTML e `Authentication-Results`    |
| `alerts.ts`       | Qual site mandou, se o provedor confirmou o remetente, e as vagas |
| `html.ts`         | Texto do HTML na ordem, com o link em volta de cada pedaço        |
| `sites/*.ts`      | Um leitor por site                                                |

## Quando um site mudar o e-mail

1. Baixe um alerta novo no Gmail (⋮ → "Baixar mensagem").
2. Gere uma versão anonimizada (sem seu nome, e-mail e links de rastreio) e
   ponha em `__fixtures__/`. Nunca o e-mail original.
3. Ajuste o leitor em `sites/` e o teste em `email.spec.ts`.

O log de cada leitura diz quantos e-mails havia e quantos foram ignorados:
um site que de repente aparece em "sem vaga" mudou o formato.
