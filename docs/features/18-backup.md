# 18 — Backup e exportação

Em **Preferências → Backup**: baixar tudo do app num `.zip`, restaurar um
backup e exportar as candidaturas em CSV.

## Decisões

- **`.zip` com JSON e os PDFs**, lido pelo próprio app. Dá para abrir e ler,
  e não depende das ferramentas do Postgres.
- **Só pelo botão:** não há backup automático. O próprio arquivo diz quando
  foi feito.
- **Restaurar substitui tudo**, numa transação só: se der erro no meio, nada
  muda. Antes de restaurar, o app grava uma cópia do estado atual em
  `BACKUP_DIR` (padrão: `backups/` na raiz do projeto, fora do git).
- **CSV das candidaturas** para Excel/Sheets: `;` como separador, BOM UTF-8
  (acentos certos no Excel) e datas DD/MM/AAAA.
- **Nada é enviado para fora:** o arquivo vai do navegador para a API local e
  volta.

## O arquivo

```
buscavagas-backup-20261014-1830.zip
├── manifest.json        { app, format: 1, createdAt, migrations, counts }
├── data/<Tabela>.json   as linhas de cada tabela (18 tabelas)
└── files/<id>.pdf       os PDFs enviados nas candidaturas
```

- **Todas as tabelas entram.** Um teste compara a lista do backup com os
  modelos do Prisma: tabela nova que não entrar no backup quebra o teste.
- Ficam de fora só o histórico do Prisma (`_prisma_migrations`) e a fila do
  Redis (buscas agendadas se recriam sozinhas).
- `format` sobe quando o arquivo mudar de um jeito que a versão antiga não lê.

## Restaurar

1. "Restaurar de um backup…" → escolher o `.zip`.
2. `POST /api/backup/inspect` lê o arquivo e mostra a data e o que tem
   ("123 vagas, 9 candidaturas, 1 PDF enviado"). Não muda nada.
3. Se não der para restaurar, a tela diz o motivo:
   - não é um `.zip` ou não é um backup do BuscaVagas;
   - backup de uma versão mais nova do app (`format` maior);
   - backup de um banco com migração que este não tem (rode `pnpm db:deploy`
     com o app atualizado).
4. "Substituir tudo pelo backup" → `POST /api/backup/restore`:
   - grava a cópia de segurança `buscavagas-antes-de-restaurar-<data e hora>.zip`
     (com segundos; nunca sobrescreve uma cópia anterior);
   - apaga as tabelas e insere o backup na ordem das dependências;
   - liga as repostagens (vaga que aponta para outra) só depois que todas as
     vagas existem;
   - deu erro (ex.: campo que este banco não tem): desfaz tudo e avisa;
   - deu certo: recalcula a nota de todas as vagas com as regras de agora.
5. Todas as telas recarregam da API.

Backup feito com uma versão **mais antiga** do app restaura: as colunas novas
ficam com o valor padrão.

## Segurança

A API só aceita escrita em JSON (barreira contra sites abertos no navegador,
`common/security/local-only.ts`). A restauração manda o `.zip` cru com
`Content-Type: application/zip`, que também não é um tipo "simples": o
navegador pergunta antes (preflight) e o CORS recusa outros sites. Multipart
e formulário continuam barrados. Limite do `.zip`: 500 MB.

## API

| Método | Rota                           | O que faz                                      |
| ------ | ------------------------------ | ---------------------------------------------- |
| `GET`  | `/api/backup`                  | baixa o `.zip`                                 |
| `POST` | `/api/backup/inspect`          | corpo: o `.zip` → `{ manifest, problem }`      |
| `POST` | `/api/backup/restore`          | corpo: o `.zip` → `{ restored, safetyBackup }` |
| `GET`  | `/api/backup/applications.csv` | candidaturas em CSV                            |

Configuração: `BACKUP_DIR` no `.env` (relativa à pasta `apps/api`). Nova
dependência: `fflate` (zip, sem dependências).

## Testes

- API:
  - todos os modelos do Prisma estão no backup, e a lista de `Json?` confere
    com o schema;
  - exporta, muda os dados, restaura igual: PDF byte a byte, repostagem,
    JSON nulo e com valor, eventos, flags e versão das preferências;
  - cópia de segurança na pasta, com o estado de antes;
  - recusa: não-zip, zip sem manifest, versão mais nova, corpo vazio — sem
    mexer em nada;
  - dado quebrado no meio da restauração: transação desfeita;
  - CSV com BOM, `;`, aspas escapadas e datas.
- Segurança: `application/zip` liberado; multipart e formulário barrados.
- Tela: links de download; restaurar (lê, mostra o resumo, confirma, envia o
  `.zip` cru); backup incompatível sem botão de restaurar.
