-- Uma vez: vagas que vieram dos alertas por e-mail (LinkedIn, Indeed,
-- Glassdoor) publicadas há mais de 30 dias saem do banco. Daqui em diante a
-- própria fonte deixa essas de fora (EMAIL_MAX_AGE_DAYS,
-- docs/features/20-email-alerts.md). Salvas e com candidatura ficam.
DELETE FROM "Job" AS j
WHERE j."source" IN ('linkedin', 'indeed', 'glassdoor')
  AND j."postedAt" < now() - interval '30 days'
  AND j."triage" <> 'saved'
  AND NOT EXISTS (SELECT 1 FROM "Application" a WHERE a."jobId" = j."id");
