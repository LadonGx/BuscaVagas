# 12 — Importar currículo de PDF

Na tela de Currículo, **"Importar de PDF"** lê o seu currículo em PDF e
completa o currículo do app. Você revisa tudo antes de gravar.

## Decisões

- **O PDF é lido no navegador** (pdf.js, carregado só quando alguém importa).
  O arquivo não vai para a API nem fica guardado; a API recebe só o que
  você aprovou na revisão.
- **Só regras, sem IA.** A IA fica para a Fase 4. As regras acertam bem
  contato e seções; nos itens de experiência e formação, a revisão existe
  justamente para corrigir o que escapar.
- **Só completa:** campo vazio é preenchido (vem marcado); campo já
  preenchido fica como está — a mudança aparece **desmarcada**, com o valor
  atual ao lado, e você troca se quiser. Experiência, formação, projeto ou
  curso com o mesmo título e organização de um que já existe vem desmarcado
  ("já existe no currículo"). Seção que não existe é criada no fim.
- **Tudo ou nada:** `POST /api/resume/import` grava numa transação; um item
  inválido não grava nenhum.
- **Com alterações não salvas no currículo, o botão fica desligado** ("Salve
  antes de importar"): o rascunho da tela sobrescreveria o que veio do PDF.
- **Limites:** PDF escaneado (imagem) não tem texto — a tela explica e pede
  o PDF exportado do editor. PDF com senha também. Até 10 MB e 6 páginas.

## Como funciona

```
arquivo ─► pdf.js (navegador) ─► pedaços de texto com posição e fonte
        ─► pdfItemsToLines   linhas na ordem de leitura (duas colunas: esquerda, depois direita)
        ─► parseResumeLines  rascunho: nome, contato, seções, itens
        ─► buildImportPlan   comparado com o currículo atual: lista de mudanças
        ─► revisão           marcar/desmarcar, corrigir texto
        ─► planToApplyInput  ─► POST /api/resume/import
```

Tudo menos o pdf.js está em `packages/shared` (`resume-import*.ts`), em
funções puras e testadas sem PDF.

### Linhas (`resume-import-pdf.ts`)

- Pedaços na mesma altura viram uma linha; um vão grande na mesma altura
  separa colunas.
- **Duas colunas:** procura um "corredor" vertical vazio entre 20% e 80% da
  largura, com texto dos dois lados. Achou: a coluna da esquerda inteira, depois
  a da direita (o que atravessa o corredor, como o nome no topo, vem antes).
- Negrito pelo nome da fonte (`Calibri-Bold`, `Inter-SemiBold`...); a linha
  conta como negrito quando **começa** em negrito ("**Sefer Pay** (React
  Native · ...)", "**Frontend:** React...").
- Ordem pela **linha visual**, não pelo y exato: o texto menor alinhado à
  direita ("Americana, SP Jul 2025 – Abr 2026") tem a base um pouco mais
  alta e passava na frente da empresa da mesma linha.

### Rascunho (`resume-import.ts`)

- **Títulos de seção**, em PT e EN: Contato, Resumo/Sobre/Perfil/Objetivo,
  Experiência, Formação, Projetos, Competências/Habilidades/Skills, Idiomas,
  Cursos/Certificações. Um título desconhecido curto, em negrito e CAIXA ALTA
  (ou maior que o corpo) vira seção de texto com o próprio nome.
- **Nome:** a maior fonte da 1ª página (fora títulos e contato); a linha logo
  abaixo, se curta, é o título profissional.
- **Cabeçalho:** "Idiomas: Português Nativo · Inglês Avançado" vira os
  idiomas; o parágrafo de apresentação vira o resumo quando não há seção
  "Resumo".
- **Contato** (no cabeçalho e na seção Contato): e-mail, telefone (BR, com ou
  sem +55), LinkedIn, GitHub, outro site (portfólio) e "Cidade, UF".
- **Itens** de Experiência, Formação e Projetos: um item novo começa na
  linha em negrito (quando a seção usa negrito para o cargo) ou depois dos
  bullets. "Cargo — Empresa", "Cargo | Empresa" e "Cargo at Empresa"
  separam título e organização. Layout "empresa em negrito, cargo embaixo"
  (comum nos modelos ATS): a linha que parece cargo/curso ("Desenvolvedor",
  "Estagiário", "Intern", "Bacharelado"...) vira o título e a de cima, a
  organização. "Cidade, UF" e "Remoto" viram o local; "Noturno · 9º
  Semestre" abre a descrição; bullets (com as quebras de linha juntadas) vêm
  depois. Tecnologias entre parênteses no título de projeto ("Sefer Pay
  (React Native · White-label)") vão para a descrição. "UNISALAmericana"
  (PDF sem o espaço) vira "UNISAL Americana".
- **Períodos:** "jan/2025 – atual", "03/2024 - 12/2024", "Feb 2023 – Present",
  "janeiro de 2022 a março de 2023", "desde 2024-05", "2021 – 2026". Só o
  ano: início em janeiro, fim em dezembro (dá para corrigir depois).
- **Cursos** sem negrito: uma linha = um curso ("AWS Cloud Practitioner –
  Amazon (2025)").
- **Competências:** "Rótulo: a, b" vira o campo com esse rótulo (linha
  quebrada continua o grupo de cima; vírgula dentro de parênteses não separa:
  "Python (OpenCV, YOLOv8)"); o resto é
  distribuído entre Linguagens, Frameworks, Banco de dados e Ferramentas (os
  campos do modelo). Em campo já preenchido, a sugestão é o valor atual **mais**
  as que faltam.
- **Idiomas:** "Inglês – avançado", "Inglês: avançado", "English (fluent)".

### Plano (`resume-import-plan.ts`)

Cada mudança diz a seção de destino (achada pelo título, como "Contato" ou
"Experiência"; sem ela, é criada), o item (campo existente ou novo), o valor
atual e o que veio do PDF. "O mesmo valor escrito de outro jeito" não vira
mudança: `Campinas/SP` = `Campinas, SP`; telefone compara os últimos 11
dígitos. Valor de exemplo (`voce@email.com`, `...@exemplo.com`) conta como
vazio: a mudança vem marcada.

## API

`POST /api/resume/import` — `{ updates: [{ itemId, data }], creates: [{ sectionId, data }], sections: [{ title, kind, items }] }`.
Cada `data` é validado pelo tipo da seção (o mesmo schema do `PATCH` de
item); erro aponta o caminho (`creates.0.data.title`). Responde o currículo
inteiro.

## Tela

1. "Escolher arquivo" → painel "Importar de PDF" → "Escolher o PDF".
2. Revisão: "Achei: nome, contato, Resumo, Experiência (2)...", e as mudanças
   por seção — caixa de seleção, o valor do PDF editável (campo, texto,
   título e organização das entradas), "Agora: ..." quando já havia valor,
   selos "campo novo", "seção nova", "já existe no currículo". "Ver o texto
   lido do PDF" mostra as linhas, para entender o que não foi reconhecido.
3. "Aplicar N mudanças" grava e fecha; "Outro PDF" recomeça.

## Testes

- Shared: períodos (PT/EN, mês por extenso, só ano, "desde"); currículo de
  uma coluna em PT (cabeçalho, contato, seções, entradas com bullet quebrado,
  cursos de uma linha, competências, idiomas, seção desconhecida); inglês com
  "Cargo — Empresa" e competências com rótulo; PDF sem texto; linhas a partir
  dos pedaços (espaços, duas colunas, negrito); plano (vazio marcado,
  preenchido desmarcado, seção nova, entrada repetida, competências
  distribuídas e somadas, mesmo valor escrito diferente); corpo do POST.
- API: aplica o plano (campos, entrada, seção nova no fim); importar de novo
  não marca nada; tudo ou nada; 404 e corpo vazio.
- Tela: revisão a partir das linhas (o pdf.js é trocado no teste), editar e
  aplicar, PDF sem texto, entrada sem título desliga "Aplicar", erro da API.
- Layout "ATS" de um currículo real, com os dados trocados: cabeçalho com
  idiomas e apresentação, empresa em negrito com cargo embaixo, local e
  período à direita, formação com turno/semestre e "Previsão de conclusão",
  projetos com tecnologias entre parênteses, competências com linha quebrada.
- Manual: PDFs de exemplo (uma coluna em PT, duas colunas em EN) e dois
  currículos reais (PT e EN) no navegador — o arquivo real não entra no
  repositório.
