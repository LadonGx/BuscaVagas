# Como adicionar uma fonte de vagas

Toda fonte segue o modelo de `packages/sources/src/_template/`. O exemplo
abaixo usa um site fictício chamado `acme`.

## 1. Antes de escrever código

- **Prefira API pública/JSON** a HTML. Muitos sites expõem o JSON que a
  própria página usa (aba Network do navegador).
- **Confira o `robots.txt` e os termos de uso.** Site que proíbe acesso
  automatizado fica de fora — LinkedIn, por exemplo.
- **Página HTML?** Procure o bloco `schema.org/JobPosting` (JSON-LD). É dado
  estruturado que o site publica para o Google e muda bem menos que o layout.
- Decida o tipo: `search` (busca por termo no acervo todo) ou
  `company-board` (lê o board de uma empresa por vez).

## 2. Copie o modelo

```bash
cp -r packages/sources/src/_template packages/sources/src/acme
```

Renomeie os arquivos para `acme.schema.ts`, `acme.mapper.ts`,
`acme.source.ts` e `acme.spec.ts`.

## 3. Salve uma resposta real

Faça uma requisição real e salve a resposta (enxugada) em
`acme/__fixtures__/`. É ela que os testes usam — nenhum teste acessa a rede.
Inclua de propósito um item quebrado, para testar o descarte.

## 4. Escreva os três arquivos

| Arquivo          | Regra                                                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `acme.schema.ts` | Só os campos que o mapper usa. `.nullish()` no que às vezes falta.                                                                                 |
| `acme.mapper.ts` | Função pura: item cru → `JobPosting` ou `null`. URL sempre via `canonicalUrl`. Dado ausente vira `null`, nunca palpite.                            |
| `acme.source.ts` | Requisições sempre por `ctx.http`, repassando `ctx.signal`. Teto fixo de páginas. Formato inesperado encerra a paginação com `ctx.log`, não lança. |

## 5. Teste

No mínimo:

- o mapper converte o item da fixture para o `JobPosting` esperado;
- o mapper devolve `null` para o item quebrado;
- a fonte monta as URLs certas e conta os descartados;
- a fonte não lança quando a resposta muda de formato.

```bash
pnpm --filter @busca-vagas/sources test
```

## 6. Registre

Em `packages/sources/src/registry.ts`:

```ts
import { AcmeSource } from './acme/acme.source';

export const ALL_SOURCES: readonly JobSource[] = [
  // ...fontes existentes
  new AcmeSource(),
];
```

A ordem importa: em vaga duplicada entre fontes, vence a que vem primeiro.
Coloque antes as que trazem dados mais completos (com descrição).

Depois rode `pnpm build:packages` para a API enxergar a fonte nova.

## Checklist

- [ ] `robots.txt` e termos de uso conferidos
- [ ] User-Agent padrão do projeto (o `ctx.http` já envia) — nunca se passar por navegador
- [ ] Teto de páginas/requisições definido
- [ ] Fixture real salva, com um item quebrado
- [ ] Testes do mapper e da fonte passando
- [ ] Fonte registrada em `registry.ts`
