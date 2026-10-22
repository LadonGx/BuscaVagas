-- Caixa = só as vagas por olhar. Repostagens que já estão na caixa de uma vaga
-- em que você se candidatou ou que descartou passam a descartadas, com o
-- motivo (as novas já entram assim; docs/features/11-reposts.md). Nenhuma
-- delas tem candidatura própria, então nada some de Candidaturas.
UPDATE "Job" AS j
SET "triage" = 'dismissed',
    "triagedAt" = now(),
    "dismissReason" = CASE
      WHEN EXISTS (SELECT 1 FROM "Application" a WHERE a."jobId" = j."repostOfId")
        THEN 'Repostagem de vaga em que você já se candidatou'
      ELSE 'Repostagem de vaga que você já descartou'
    END
FROM "Job" AS prev
WHERE j."repostOfId" = prev."id"
  AND j."triage" = 'inbox'
  AND NOT EXISTS (SELECT 1 FROM "Application" a WHERE a."jobId" = j."id")
  AND (
    prev."triage" = 'dismissed'
    OR EXISTS (SELECT 1 FROM "Application" a WHERE a."jobId" = prev."id")
  );
