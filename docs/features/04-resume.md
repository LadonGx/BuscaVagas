# 04 — Currículo em blocos ("gaveta")

O objetivo é **copiar e colar em formulário de candidatura**: cada bloco é uma
unidade copiável (o e-mail, o resumo, uma experiência inteira). Decisão:
**estrutura flexível** — seções padrão criadas automaticamente, mas você
cria, renomeia, reordena e apaga seções e itens.

## Modelo

`ResumeSection`: `title`, `kind`, `position`.
`ResumeItem`: `sectionId`, `position`, `data` (JSON validado por Zod conforme o `kind` da seção).

| `kind` da seção | Formato de cada item                                                               | Exemplo                              |
| --------------- | ---------------------------------------------------------------------------------- | ------------------------------------ |
| `fields`        | `{ label, value }`                                                                 | E-mail → `voce@email.com`            |
| `text`          | `{ text }`                                                                         | Resumo profissional                  |
| `entries`       | `{ title, organization?, location?, startDate?, endDate?, current, description? }` | Uma experiência, formação ou projeto |

- Datas de `entries` no formato `AAAA-MM` (mês basta em currículo).
- `current: true` exige `endDate` vazio.
- O `kind` de uma seção **não muda** depois de criada — invalidaria os itens.

JSON e não colunas: cada tipo tem campos diferentes e nada aqui é filtrado
por SQL. A validação forte fica no Zod, na borda.

## Seções padrão

Criadas no primeiro `GET /api/resume` quando não existe nenhuma seção:

| Seção                  | Tipo    | Itens iniciais (vazios para preencher)                                                                                                         |
| ---------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Dados pessoais         | fields  | Nome completo · Data de nascimento · Cidade/UF                                                                                                 |
| Contato                | fields  | E-mail · Telefone/WhatsApp                                                                                                                     |
| Links                  | fields  | LinkedIn · GitHub · Portfólio                                                                                                                  |
| Resumo profissional    | text    | um texto                                                                                                                                       |
| Experiência            | entries | —                                                                                                                                              |
| Formação               | entries | —                                                                                                                                              |
| Projetos               | entries | —                                                                                                                                              |
| Competências           | fields  | Linguagens · Frameworks · Banco de dados · Ferramentas                                                                                         |
| Idiomas                | fields  | Inglês                                                                                                                                         |
| Cursos e certificações | entries | —                                                                                                                                              |
| Respostas prontas      | fields  | Pretensão salarial (CLT) · Pretensão salarial (PJ) · Disponibilidade para início · Modelo de trabalho preferido · Por que quero trabalhar aqui |

A criação usa um _advisory lock_ do Postgres, então duas abas abrindo ao
mesmo tempo não duplicam as seções. Apagar **todas** as seções faz o padrão
voltar no próximo acesso.

## Rotas

| Método   | Rota                                   | Observação                                                      |
| -------- | -------------------------------------- | --------------------------------------------------------------- |
| `GET`    | `/api/resume`                          | seções com itens, em ordem                                      |
| `GET`    | `/api/resume/export`                   | currículo inteiro em `text/plain` (campos vazios ficam de fora) |
| `POST`   | `/api/resume/sections`                 | `{ title, kind }` → vai para o fim                              |
| `PATCH`  | `/api/resume/sections/:id`             | `{ title }`                                                     |
| `DELETE` | `/api/resume/sections/:id`             | apaga os itens junto                                            |
| `PUT`    | `/api/resume/sections/order`           | `{ ids }` — **todos** os ids, na nova ordem                     |
| `POST`   | `/api/resume/sections/:id/items`       | `{ data }` → vai para o fim                                     |
| `PATCH`  | `/api/resume/items/:id`                | `{ data }` (substitui)                                          |
| `DELETE` | `/api/resume/items/:id`                |                                                                 |
| `PUT`    | `/api/resume/sections/:id/items/order` | `{ ids }` — todos os itens da seção                             |

Reordenar com lista incompleta, repetida ou com id de fora → 400.

## Texto para copiar

A formatação de cada item em texto (`resumeItemToText`) fica em
`packages/shared`: o botão "copiar" do front e o `/export` da API usam a
mesma função. Exemplo de `entries`:

```
Desenvolvedor Full Stack Trainee — Empresa (Americana, SP)
01/2026 – atual
Descrição...
```

## Testes

- Unit: validação por tipo, regra `current`/`endDate`, `resumeItemToText`, export.
- Integração: seed só uma vez (inclusive em chamadas simultâneas), CRUD,
  item com formato do tipo errado → 400, reordenar (válido e inválido),
  apagar seção leva os itens.

## Depois

- Importar de PDF (Fase 3) e versão do currículo congelada em cada candidatura.
