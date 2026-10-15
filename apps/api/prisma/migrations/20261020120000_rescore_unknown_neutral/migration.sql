-- A nota passou a contar o critério que a vaga não informa como meio-termo
-- (docs/features/07-preferences-score.md). Sem mudança de tabela: só marca
-- todas as vagas para a fila `scoring` recalcular com a regra nova.
UPDATE "Job" SET "scoredVersion" = NULL WHERE "scoredVersion" IS NOT NULL;
