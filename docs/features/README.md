# Planos de features

Cada feature tem um plano próprio, escrito **antes** do código: modelo de
dados, rotas, regras de negócio, testes e decisões tomadas. Quando a
implementação divergir do plano, o plano é atualizado junto.

| #   | Feature                                          | Status |
| --- | ------------------------------------------------ | ------ |
| 00  | [Base compartilhada](00-base.md)                 | ✅     |
| 01  | [Vagas](01-jobs.md)                              | ✅     |
| 02  | [Triagem: salvar/descartar](02-triage.md)        | ✅     |
| 03  | [Candidaturas com histórico](03-applications.md) | ✅     |
| 04  | [Currículo em blocos](04-resume.md)              | ✅     |

Ordem de dependência: 00 → 01 → 02 → 03 (usa a triagem) · 04 é independente.
