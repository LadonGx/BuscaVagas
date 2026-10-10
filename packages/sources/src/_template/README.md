# Modelo de fonte

Esta pasta é o ponto de partida para cada site novo. Ela **não** é exportada
pelo pacote — serve só de exemplo, e os testes dela rodam no CI para garantir
que o modelo continua funcionando.

Cada fonte tem os mesmos arquivos, sempre com o prefixo do site:

| Arquivo            | Responsabilidade                                                  |
| ------------------ | ----------------------------------------------------------------- |
| `<site>.config.ts` | Configuração própria, lida do `.env` com prefixo (`<SITE>_*`).    |
| `<site>.schema.ts` | Formato da resposta do site, em Zod. Só os campos que usamos.     |
| `<site>.mapper.ts` | Converte um item do site para `JobPosting`. Função pura.          |
| `<site>.source.ts` | Faz as requisições e junta tudo. Implementa `JobSource`.          |
| `<site>.spec.ts`   | Testa o mapper e a fonte com a resposta salva em `__fixtures__/`. |
| `index.ts`         | Exporta a `SourceDefinition` — é só isso que o registro importa.  |
| `README.md`        | Endpoint, limites e manias do site, para quem for dar manutenção. |

Passo a passo completo em [`docs/ADDING_A_SOURCE.md`](../../../../docs/ADDING_A_SOURCE.md).
