import type { ApplicationDto, ApplicationStatus } from '@busca-vagas/shared';

export interface BoardColumn {
  id: 'applied' | 'in_process' | 'offer' | 'closed';
  title: string;
  statuses: ApplicationStatus[];
  /** Status ao soltar aqui. `null` = perguntar (Encerradas: recusada ou desisti). */
  dropStatus: ApplicationStatus | null;
}

export const BOARD_COLUMNS: BoardColumn[] = [
  { id: 'applied', title: 'Aplicada', statuses: ['applied'], dropStatus: 'applied' },
  { id: 'in_process', title: 'Em processo', statuses: ['in_process'], dropStatus: 'in_process' },
  { id: 'offer', title: 'Proposta', statuses: ['offer'], dropStatus: 'offer' },
  { id: 'closed', title: 'Encerradas', statuses: ['rejected', 'withdrawn'], dropStatus: null },
];

export function columnOf(status: ApplicationStatus): BoardColumn {
  return BOARD_COLUMNS.find((column) => column.statuses.includes(status)) ?? BOARD_COLUMNS[0]!;
}

/** Em andamento: ainda pode ter próxima etapa. */
export function isOpen(application: Pick<ApplicationDto, 'status'>): boolean {
  return columnOf(application.status).id !== 'closed';
}

/** Próximas etapas dentro dos próximos `days` dias (para o subtítulo). */
export function stepsWithin(applications: readonly ApplicationDto[], now: Date, days = 7): number {
  const limit = now.getTime() + days * 86_400_000;
  return applications.filter((application) => {
    if (!application.nextStepAt || !isOpen(application)) return false;
    const at = new Date(application.nextStepAt).getTime();
    return at >= now.getTime() && at <= limit;
  }).length;
}
