# 22 — Preencher a candidatura (nunca enviar)

`pnpm candidatar` abre a vaga numa janela do Chrome (ou do Edge) e preenche o
formulário com o seu Currículo do app. Quem confere e clica em enviar é você.

## Decisões

- **Navegador do Playwright, no seu computador:** um comando abre o Chrome ou
  o Edge já instalado, com um perfil só do BuscaVagas
  (`~/.buscavagas/navegador`, fora do projeto). Os logins que você fizer nele
  (Gupy, sites de carreira) ficam salvos nesse perfil. Nenhuma senha passa
  pelo app. No Docker o app não abre janelas, então o comando roda fora do
  container e fala com o app pelo endereço de sempre.
- **Nunca envia:** o preenchimento só escreve em campos **vazios** e marca
  opções. Não clica em botão, não aperta Enter, não marca caixa de aceite
  (termos, LGPD) e não passa de etapa. Os campos preenchidos ficam com
  contorno roxo e um aviso no canto da página lembra que quem envia é você.
- **Sites proibidos:** LinkedIn, Indeed, Glassdoor, InfoJobs e Vagas.com
  proíbem automação nos termos. O comando recusa essas vagas, e se a janela
  for parar num desses sites, ele não mexe em nada lá.
- **Genérico + Gupy:** acha os campos pelo rótulo, em qualquer site permitido
  e dentro de quadros (iframe). Na Gupy, você clica em "Candidatar-se" e
  entra com a sua conta; a Gupy já guarda seus dados, e aqui entram as
  perguntas da empresa e o currículo.
- **Currículo em PDF:** o mesmo da tela Currículo → "Salvar como PDF", gerado
  na hora numa pasta temporária (apagada ao sair) e anexado no campo de
  currículo. Nada vai para o repositório.
- **Respostas salvas:** as da seção "Respostas prontas" do Currículo (e os
  outros campos, como "Idiomas"). Pergunta sem resposta salva fica em branco.
  Texto gerado por IA fica para a Fase 4.

## Usar

Precisa do Node e do pnpm no computador (`pnpm install` uma vez), do app
rodando (Docker ou dev) e do Google Chrome ou do Microsoft Edge.

```bash
pnpm candidatar            # escolhe entre as vagas salvas
pnpm candidatar <id>       # a vaga do app (o painel da vaga mostra o comando)
pnpm candidatar <link>     # qualquer link de vaga de site permitido
```

1. A janela abre na vaga. Vá até o formulário (na Gupy, "Candidatar-se" e
   login). Os campos vazios são preenchidos conforme aparecem, etapa por
   etapa.
2. O terminal lista o que foi preenchido e o que ficou para você:

   ```
     ✓ Nome completo ← Nome completo
     ✓ Qual a sua pretensão salarial (CLT)? ← Pretensão salarial (CLT)
     · CPF: dado pessoal sensível: preencha você
     · Pretensão salarial: mais de uma resposta serve (... (CLT), ... (PJ)): escolha você
     · Por que você quer trabalhar conosco?: sem resposta salva
   ```

3. Confira, complete e envie você mesmo.
4. Feche a janela. O terminal pergunta "Você enviou a candidatura? (s/N)".
   Com "s", a candidatura é registrada no app (com a cópia do currículo e o
   PDF que foi anexado, como em [14](14-resume-versions.md)).

No painel da vaga (tela Vagas), "Preencher a candidatura" mostra o comando
com o id da vaga, com botão de copiar. Nos sites restritos, avisa que não dá.

## O que é preenchido

| No formulário                                    | Vem de (Currículo)                               |
| ------------------------------------------------ | ------------------------------------------------ |
| Nome, nome completo, primeiro nome, sobrenome    | "Nome completo" (o primeiro nome e o resto)      |
| E-mail, telefone/celular/WhatsApp                | "E-mail", "Telefone/WhatsApp"                    |
| Cidade, estado/UF, localização                   | "Cidade/UF" ("Campinas/SP" → Campinas, SP)       |
| LinkedIn, GitHub, portfólio/site                 | "Links"                                          |
| Data de nascimento (campo de data: AAAA-MM-DD)   | "Data de nascimento" (15/03/1999)                |
| "Fale sobre você" (só caixa de texto grande)     | "Resumo profissional"                            |
| Campo de arquivo de currículo (ou o único campo) | O PDF do Currículo                               |
| Outras perguntas                                 | "Respostas prontas" e demais campos, pelo rótulo |

Como uma resposta salva casa com a pergunta: as palavras do rótulo (sem
acento, sem "de", "a", "qual"...) precisam estar na pergunta. Com até duas
palavras, todas; com mais, 60% delas ("Por que quero trabalhar aqui" casa com
"Por que você quer trabalhar na empresa?"). O que está entre parênteses
desempata: "Pretensão salarial (CLT)" ganha de "(PJ)" quando a pergunta diz
CLT. Se as duas servem igualmente, nenhuma é usada.

Listas e opções (select, radio) só são marcadas quando a resposta está entre
as opções ("Avançado" → "Avançado (C1)"). Campo de número recebe só o número
("R$ 4.500" → 4500).

**Nunca preenchidos:** senha, CPF, RG, CNH, PIS, passaporte, cartão, conta,
captcha, nome social, nome da mãe/pai, caixas de aceite e campos que já têm
valor (o que o site ou você preencheu fica).

## Configuração (opcional)

| Variável               | Para quê                                                        |
| ---------------------- | --------------------------------------------------------------- |
| `BUSCAVAGAS_URL`       | Endereço do app, se não for `127.0.0.1:8080` nem `:3333`        |
| `BUSCAVAGAS_NAVEGADOR` | `chrome`, `msedge`, `chromium` ou o caminho do executável       |
| `BUSCAVAGAS_PERFIL`    | Pasta do perfil do navegador (padrão `~/.buscavagas/navegador`) |

Para começar do zero (sair de todas as contas), apague a pasta do perfil.

## Limites

- Campos de lista feitos com `div` (não `select`), comuns em sites com
  componentes próprios, não são marcados: o terminal não avisa deles.
- O PDF usa as seções que a tela de impressão mostra por padrão (sem
  "Respostas prontas", data de nascimento e pretensão). As escolhas feitas
  na tela ficam no seu navegador e não chegam aqui.
- Login com Google às vezes recusa navegador controlado por programa. Entre
  com e-mail e senha do site.
- O formulário real da Gupy fica atrás do login e não foi visto durante o
  desenvolvimento: o preenchimento usa as regras genéricas. Se algo vier
  errado lá, o terminal mostra a pergunta e o motivo.

## Código

`apps/apply/`:

| Arquivo             | O que faz                                                     |
| ------------------- | ------------------------------------------------------------- |
| `src/main.ts`       | O comando: acha o app e a vaga, gera o PDF, abre, registra    |
| `src/profile.ts`    | Currículo → dados conhecidos e respostas por rótulo           |
| `src/match.ts`      | Campo → resposta (ou por que não), formatos de data e número  |
| `src/scan.ts`       | Roda na página: lê os campos, escreve como digitação, o aviso |
| `src/filler.ts`     | A cada 1,5 s, campos novos de cada página e quadro            |
| `src/resume-pdf.ts` | O PDF de `/curriculo/imprimir`, num navegador invisível       |
| `src/browser.ts`    | Chrome/Edge instalado, perfil próprio                         |
| `src/app-client.ts` | Vaga, currículo, candidatura e PDF pela API                   |

Sem mudança no banco nem na API.

## Testes

- `match.spec.ts`: currículo → perfil, rótulos conhecidos, respostas salvas
  (CLT/PJ, empate, "viagens" ≠ "início"), opções, sensíveis, tamanho máximo,
  arquivo de currículo e foto, datas, números, nome do PDF.
- `scan.spec.ts` (jsdom): pergunta pelo `<label>`, aria, texto antes do campo
  e legenda; campos escondidos, senha, caixa de aceite e já preenchidos de
  fora; só os campos novos na volta seguinte; escreve sem enviar o
  formulário e sem sobrescrever o que você digitou; o aviso.
- `VagasPage.spec.tsx`: o painel mostra e copia o comando; site restrito não.
- Conferido de ponta a ponta no Chromium: formulário de teste em duas etapas
  com iframe → 11 campos preenchidos, currículo anexado, CPF e senha em
  branco, "Enviar candidatura" nunca disparado → "s" no fim registrou a
  candidatura com o PDF.
