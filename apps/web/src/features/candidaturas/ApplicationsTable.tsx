import { APPLICATION_STATUSES, type ApplicationDto } from '@busca-vagas/shared';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useState } from 'react';
import { ApplicationStatusChip } from '../../components/job/Chips';
import { formatDate, formatDateTime } from '../../lib/format';
import { isOpen } from './columns';
import styles from './ApplicationsTable.module.css';

type SortKey = 'title' | 'company' | 'status' | 'appliedAt' | 'nextStepAt' | 'updatedAt';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'title', label: 'Vaga' },
  { key: 'company', label: 'Empresa' },
  { key: 'status', label: 'Status' },
  { key: 'appliedAt', label: 'Aplicada em' },
  { key: 'nextStepAt', label: 'Próxima etapa' },
  { key: 'updatedAt', label: 'Atualizada' },
];

function value(application: ApplicationDto, key: SortKey): string | number {
  switch (key) {
    case 'title':
      return application.job.title.toLocaleLowerCase('pt-BR');
    case 'company':
      return application.job.company.toLocaleLowerCase('pt-BR');
    case 'status':
      return APPLICATION_STATUSES.indexOf(application.status);
    case 'nextStepAt':
      // Sem próxima etapa vai para o fim.
      return application.nextStepAt && isOpen(application) ? application.nextStepAt : '9999';
    default:
      return application[key];
  }
}

export function sortApplications(
  applications: readonly ApplicationDto[],
  key: SortKey,
  direction: 'asc' | 'desc',
): ApplicationDto[] {
  const factor = direction === 'asc' ? 1 : -1;
  return [...applications].sort((a, b) => {
    const x = value(a, key);
    const y = value(b, key);
    return (x < y ? -1 : x > y ? 1 : 0) * factor;
  });
}

/** Visão em lista: as mesmas candidaturas numa tabela ordenável. */
export function ApplicationsTable({
  applications,
  onOpen,
}: {
  applications: ApplicationDto[];
  onOpen: (id: string) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'updatedAt',
    direction: 'desc',
  });
  const rows = sortApplications(applications, sort.key, sort.direction);

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {COLUMNS.map(({ key, label }) => {
              const active = sort.key === key;
              return (
                <th
                  key={key}
                  scope="col"
                  aria-sort={
                    active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
                  }
                >
                  <button
                    type="button"
                    onClick={() =>
                      setSort({
                        key,
                        direction: active && sort.direction === 'asc' ? 'desc' : 'asc',
                      })
                    }
                  >
                    {label}
                    {active &&
                      (sort.direction === 'asc' ? (
                        <ArrowUp size={14} aria-hidden="true" />
                      ) : (
                        <ArrowDown size={14} aria-hidden="true" />
                      ))}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((application) => (
            <tr key={application.id}>
              <td>
                <button
                  type="button"
                  className={styles.link}
                  onClick={() => onOpen(application.id)}
                >
                  {application.job.title}
                </button>
              </td>
              <td>{application.job.company}</td>
              <td>
                <ApplicationStatusChip status={application.status} />
              </td>
              <td>{formatDate(application.appliedAt)}</td>
              <td>
                {application.nextStepAt && isOpen(application)
                  ? formatDateTime(application.nextStepAt)
                  : '—'}
              </td>
              <td>{formatDate(application.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
