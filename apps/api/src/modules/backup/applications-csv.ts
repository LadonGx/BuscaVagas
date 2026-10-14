import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from '@busca-vagas/shared';

export interface CsvApplication {
  status: ApplicationStatus;
  appliedAt: Date;
  updatedAt: Date;
  appliedVia: string | null;
  salaryExpectation: number | null;
  notes: string | null;
  nextStepAt: Date | null;
  nextStepNote: string | null;
  job: { title: string; company: string; source: string; url: string | null };
}

const HEADER = [
  'Vaga',
  'Empresa',
  'Status',
  'Aplicada em',
  'Última atualização',
  'Fonte',
  'Onde se candidatou',
  'Pretensão (R$)',
  'Próxima etapa',
  'O que é a próxima etapa',
  'Anotações',
  'Link',
];

/** Campo do CSV: entre aspas se tiver separador, aspas ou quebra de linha. */
export function csvField(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const sourceLabel = (source: string) =>
  source === 'manual' ? 'Cadastro manual' : source.charAt(0).toUpperCase() + source.slice(1);

/**
 * Candidaturas em CSV para Excel/Sheets em PT-BR: `;` como separador, BOM
 * UTF-8 (acentos certos no Excel) e datas DD/MM/AAAA no fuso local.
 * Plano: docs/features/18-backup.md
 */
export function applicationsCsv(rows: readonly CsvApplication[], timeZone: string): string {
  const date = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const dateTime = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const lines = rows.map((row) =>
    [
      row.job.title,
      row.job.company,
      APPLICATION_STATUS_LABELS[row.status],
      date.format(row.appliedAt),
      date.format(row.updatedAt),
      sourceLabel(row.job.source),
      row.appliedVia,
      row.salaryExpectation,
      row.nextStepAt ? dateTime.format(row.nextStepAt) : null,
      row.nextStepNote,
      row.notes,
      row.job.url,
    ]
      .map(csvField)
      .join(';'),
  );
  return `\uFEFF${[HEADER.join(';'), ...lines].join('\r\n')}\r\n`;
}
