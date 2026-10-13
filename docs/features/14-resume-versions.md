# 14 — Currículo de cada candidatura

Meses depois, a empresa liga para a entrevista: o que você mandou para ela?
Cada candidatura guarda **a cópia do currículo do app** daquele dia e, se você
anexar, **o PDF que enviou de verdade**.

## Decisões

- **Automático no "Me candidatei":** a cópia do currículo do app é guardada
  na mesma transação que cria a candidatura. Currículo vazio: nada é
  guardado.
- **Candidaturas de antes desta função** (ou feitas com o currículo vazio):
  botão "Guardar o currículo de hoje" no painel.
- **Os dois:** a cópia do app (seções e campos) e o PDF enviado. Você manda
  PDFs feitos em outro editor (modelo ATS); a cópia do app pode não ser igual
  ao PDF — por isso dá para anexar o arquivo.
- **Ver, imprimir e comparar.** Não há "restaurar": o currículo de hoje só
  muda pela tela de Currículo.
- **Uma cópia por conteúdo:** o mesmo currículo enviado em cinco candidaturas
  é guardado uma vez (`ResumeSnapshot.hash`). Cópia que nenhuma candidatura
  usa mais é apagada.
- **Trocar a cópia** ("Guardar o de hoje…") pede confirmação: serve para
  quando você reenviou o currículo no mesmo processo.
- **PDF no banco** (`bytea`), um por candidatura, até 10 MB. Vai junto no
  backup do Postgres e some quando a candidatura é apagada.

## Dados

| Modelo / campo                                    | O que é                                                       |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `ResumeSnapshot { hash, sections, createdAt }`    | `sections` = `ResumeSectionDto[]` daquele momento, com os ids |
| `Application.resumeSnapshotId`, `resumeSavedAt`   | qual cópia e quando foi guardada para esta candidatura        |
| `ApplicationFile { name, size, sha256, content }` | o PDF enviado (1:1 com a candidatura, `onDelete: Cascade`)    |

Migração `20261014120000_resume_versions` (rode `pnpm db:deploy`).

O hash vem de `canonicalResume` (`packages/shared/src/resume-snapshot.ts`):
seções e itens na ordem, ids e dados, chaves ordenadas — sem datas. Mudar a
ordem conta como mudança; renumerar posições sem mudar a ordem, não.

## API

| Método   | Rota                                | O que faz                                                                                                         |
| -------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/applications/:id`             | agora com `resume: { snapshotId, savedAt, sameAsCurrent }` e `resumeFile: { name, size, uploadedAt }` (ou `null`) |
| `GET`    | `/api/applications/:id/resume`      | a cópia inteira (`{ id, savedAt, sections }`); 404 se não há                                                      |
| `POST`   | `/api/applications/:id/resume`      | guarda o currículo de hoje (troca a cópia); 400 se o currículo está vazio                                         |
| `PUT`    | `/api/applications/:id/resume-file` | `{ name, contentBase64 }` — anexa ou troca o PDF; 400 se não começa com `%PDF-`; 413 acima de 10 MB               |
| `GET`    | `/api/applications/:id/resume-file` | baixa o PDF (`Content-Disposition: attachment`)                                                                   |
| `DELETE` | `/api/applications/:id/resume-file` | remove o PDF                                                                                                      |

- **Por que base64 em JSON:** a API só aceita escrita com
  `Content-Type: application/json` (barreira contra sites abertos no
  navegador, ver `common/security/local-only.ts`). O limite de JSON subiu de
  100 KB para 15 MB para caber o PDF.
- `sameAsCurrent` compara o hash da cópia com o do currículo de hoje (lido
  sem criar as seções padrão).

## Comparar com o atual

`diffResume(cópia, hoje)` casa seções e itens pelo id:

- seção nova, removida, renomeada; ordem das seções ou dos itens;
- item novo ("Entrou: Experiência · Estagiária — Beta"), que saiu, ou que
  mudou — campo (rótulo/valor, com antes → depois), texto (antes → depois) e
  entrada (Título, Organização, Local, Período, Descrição);
- item ou seção só com campos vazios não conta.

## Tela

- Painel da candidatura, bloco **"Currículo enviado"**:
  - cópia do app: "guardado em 04/10/2026", selo "Igual ao de hoje" ou
    "Mudou desde então", **Ver e imprimir**, **Comparar com o atual** (lista
    do que mudou) e **Guardar o de hoje…** (com confirmação). Sem cópia:
    "Guardar o currículo de hoje";
  - PDF enviado: nome, tamanho e data; **Baixar**, **Trocar**, **Remover…**
    (com confirmação). Sem PDF: "Anexar o PDF enviado" (só PDF, até 10 MB,
    conferido antes de enviar).
- `/curriculo/imprimir?candidatura=<id>`: a mesma página de impressão, com a
  cópia; aviso "Versão enviada em …" com a vaga e "Voltar à candidatura". As
  escolhas do que entra no PDF valem para as duas (os ids são os mesmos).

## Testes

- Shared: currículo com conteúdo; texto canônico (ordem das chaves e
  numeração das posições não mudam o hash; conteúdo muda); base64;
  comparação (sem mudança, campo, texto, entrada, item novo e que saiu,
  seções nova/removida/renomeada/ordem, seção só com campos vazios).
- API: currículo vazio não guarda; "Me candidatei" guarda e mudar o
  currículo depois não muda a cópia (`sameAsCurrent` vira `false`); mesma
  cópia para o mesmo conteúdo; "guardar o de hoje" troca e apaga a sem uso;
  400 com currículo vazio; apagar candidatura apaga a cópia só sem outro uso;
  PDF de ~2 MB anexa, baixa igual (nome com acento), troca e remove; recusa
  não-PDF, base64 inválido e candidatura inexistente; PDF sai junto com a
  candidatura.
- Tela: selo, imprimir e lista de diferenças; igual ao de hoje sem botões;
  trocar com confirmação; guardar quando não há cópia; anexar (base64),
  baixar e remover com confirmação; recusa outro tipo de arquivo; página de
  impressão com a cópia.
