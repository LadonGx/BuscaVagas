import type {
  DirectoryCompanyDto,
  DirectoryRegion,
  SourceInfoDto,
  TrackedCompanyDto,
} from '@busca-vagas/shared';
import { Check, ExternalLink, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  useAddCompany,
  useCompanies,
  useCompanyDirectory,
  useRecheckCompany,
  useRemoveCompany,
  useUpdateCompany,
} from '../../api/companies';
import { Button } from '../../components/ui/Button';
import { Drawer } from '../../components/ui/Drawer';
import { useToast } from '../../components/toast/toast-context';
import { formatAgo, formatNumber } from '../../lib/format';
import { useNow } from '../../lib/useNow';
import styles from './Companies.module.css';
import { shortError } from './ErrorText';

/* ------------------------------------------------------------ textos */

const plural = (count: number, one: string, many: string) =>
  `${formatNumber(count)} ${count === 1 ? one : many}`;

/** "greenhouse" → "Greenhouse", com o nome que a API dá quando houver. */
export function boardName(sourceId: string, boards: readonly SourceInfoDto[]): string {
  return (
    boards.find((board) => board.id === sourceId)?.displayName ??
    sourceId.charAt(0).toUpperCase() + sourceId.slice(1)
  );
}

/** Linha de estado de uma empresa da lista, e o tom (erro em vermelho). */
export function companyStatus(
  company: TrackedCompanyDto,
  board: string,
  now: Date,
): { text: string; tone: 'bad' | null } {
  const off = company.active ? '' : 'Desligada · ';
  if (!company.lastCheckedAt) {
    return { text: `${off}Ainda não lida — entra na próxima busca`, tone: null };
  }
  const when = formatAgo(company.lastCheckedAt, now);
  if (company.lastStatus === 'not_found') {
    return {
      text: `${off}Não encontrada (404) ${when}: o link mudou ou a empresa saiu do ${board}`,
      tone: 'bad',
    };
  }
  if (company.lastStatus === 'failed') {
    return {
      text: `${off}Falhou ${when}: ${shortError(company.lastError ?? 'erro desconhecido')}`,
      tone: 'bad',
    };
  }
  const jobs = company.lastJobs ?? 0;
  const matched = company.lastMatched ?? 0;
  return {
    text: `${off}${plural(jobs, 'vaga', 'vagas')} no board, ${formatNumber(matched)} ${matched === 1 ? 'passa' : 'passam'} nos filtros · ${when}`,
    tone: null,
  };
}

/** "Stone adicionada · 17 de 111 vagas passam nos filtros (12 novas)". */
export function addedMessage(company: TrackedCompanyDto, jobsNew: number): string {
  const jobs = company.lastJobs ?? 0;
  const matched = company.lastMatched ?? 0;
  const news = jobsNew > 0 ? ` (${plural(jobsNew, 'nova', 'novas')} na caixa)` : '';
  return `${company.displayName} adicionada · ${formatNumber(matched)} de ${plural(jobs, 'vaga passa', 'vagas passam')} nos filtros${news}.`;
}

/** Sem acento e sem maiúsculas: "sao" acha "São Paulo". */
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filterDirectory(
  companies: readonly DirectoryCompanyDto[],
  search: string,
  region: DirectoryRegion | 'all',
): DirectoryCompanyDto[] {
  const term = fold(search.trim());
  return companies
    .filter((company) => region === 'all' || company.region === region)
    .filter(
      (company) =>
        !term || fold(`${company.name} ${company.segment} ${company.source}`).includes(term),
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
}

const listFormat = new Intl.ListFormat('pt-BR', { type: 'conjunction' });

/** "Greenhouse, Lever e Ashby". */
export function boardNames(boards: readonly SourceInfoDto[]): string {
  return boards.length > 0
    ? listFormat.format(boards.map((board) => board.displayName))
    : 'Os boards';
}

/** "2026-10-12" → "12/10/2026" (sem passar por fuso). */
const dayMonthYear = (date: string) => date.split('-').reverse().join('/');

/* ------------------------------------------------------------ painel */

type Tab = 'lista' | 'diretorio';
const TABS: { id: Tab; label: string }[] = [
  { id: 'lista', label: 'Minha lista' },
  { id: 'diretorio', label: 'Diretório' },
];

interface CompaniesDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Fontes do tipo board (Greenhouse, Lever, Ashby), para os nomes. */
  boards: SourceInfoDto[];
}

/**
 * As empresas que Greenhouse, Lever e Ashby leem. Duas abas: a lista (com
 * "adicionar pelo link") e o diretório de empresas verificadas.
 */
export function CompaniesDrawer({ open, onClose, boards }: CompaniesDrawerProps) {
  const [tab, setTab] = useState<Tab>('lista');
  const companies = useCompanies(open);
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const count = companies.data?.length;

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
    setTab(TABS[next]!.id);
    tabRefs.current[next]?.focus();
  }

  return (
    <Drawer open={open} onClose={onClose} title="Empresas acompanhadas" size="wide">
      <p className={styles.hint}>
        {boardNames(boards)} leem as vagas direto da página de cada empresa desta lista. Entram as
        vagas de tecnologia no Brasil ou remotas abertas a quem está aqui.
      </p>

      <div className={styles.tabs} role="tablist" aria-label="Empresas">
        {TABS.map((item, index) => (
          <button
            key={item.id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`${baseId}-${item.id}-tab`}
            aria-controls={`${baseId}-${item.id}`}
            aria-selected={tab === item.id}
            tabIndex={tab === item.id ? 0 : -1}
            className={styles.tab}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => onTabKey(event, index)}
          >
            {item.label}
            {item.id === 'lista' && count !== undefined && (
              <span className={styles.tabCount}>{formatNumber(count)}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'lista' ? (
        <div
          role="tabpanel"
          id={`${baseId}-lista`}
          aria-labelledby={`${baseId}-lista-tab`}
          className={styles.panel}
        >
          <AddByLink />
          {companies.isPending && <p className={styles.hint}>Carregando…</p>}
          {companies.isError && <p className={styles.error}>{companies.error.message}</p>}
          {companies.data && (
            <TrackedList
              companies={companies.data}
              boards={boards}
              onBrowse={() => setTab('diretorio')}
            />
          )}
        </div>
      ) : (
        <div
          role="tabpanel"
          id={`${baseId}-diretorio`}
          aria-labelledby={`${baseId}-diretorio-tab`}
          className={styles.panel}
        >
          <Directory boards={boards} />
        </div>
      )}
    </Drawer>
  );
}

/* --------------------------------------------------- adicionar pelo link */

function AddByLink() {
  const [url, setUrl] = useState('');
  const add = useAddCompany();
  const toast = useToast();
  const inputId = useId();
  const messageId = `${inputId}-msg`;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!url.trim() || add.isPending) return;
    add.mutate(
      { url: url.trim() },
      {
        onSuccess: (result) => {
          setUrl('');
          toast.show({ message: addedMessage(result.company, result.jobsNew), tone: 'success' });
        },
      },
    );
  }

  return (
    <form className={styles.addForm} onSubmit={submit} noValidate>
      <label htmlFor={inputId} className={styles.label}>
        Adicionar pelo link
      </label>
      <div className={styles.addRow}>
        <input
          id={inputId}
          className={styles.input}
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://jobs.lever.co/empresa"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            if (add.isError) add.reset();
          }}
          aria-invalid={add.isError || undefined}
          aria-describedby={messageId}
        />
        <Button
          type="submit"
          variant="primary"
          icon={<Plus size={16} aria-hidden="true" />}
          disabled={!url.trim() || add.isPending}
        >
          {add.isPending ? 'Conferindo…' : 'Adicionar'}
        </Button>
      </div>
      <p id={messageId} className={add.isError ? styles.error : styles.hint} role="status">
        {add.isError
          ? add.error.message
          : 'A página de vagas da empresa no Greenhouse, Lever ou Ashby (pode ser o link de uma vaga). O board é conferido antes de entrar.'}
      </p>
    </form>
  );
}

/* ---------------------------------------------------------- a lista */

interface TrackedListProps {
  companies: TrackedCompanyDto[];
  boards: SourceInfoDto[];
  onBrowse: () => void;
}

function TrackedList({ companies, boards, onBrowse }: TrackedListProps) {
  if (companies.length === 0) {
    return (
      <div className={styles.empty}>
        <p>Nenhuma empresa ainda.</p>
        <p className={styles.hint}>
          Cole o link acima ou escolha no diretório de empresas verificadas.
        </p>
        <Button onClick={onBrowse}>Ver o diretório</Button>
      </div>
    );
  }

  // Na ordem das fontes (Greenhouse, Lever, Ashby); fonte desconhecida no fim.
  const order = (source: string) => {
    const index = boards.findIndex((board) => board.id === source);
    return index === -1 ? boards.length : index;
  };
  const groups = new Map<string, TrackedCompanyDto[]>();
  for (const company of [...companies].sort((a, b) => order(a.source) - order(b.source))) {
    groups.set(company.source, [...(groups.get(company.source) ?? []), company]);
  }

  return (
    <>
      {[...groups].map(([source, items]) => {
        const name = boardName(source, boards);
        const on = items.filter((item) => item.active).length;
        return (
          <section key={source} className={styles.group} aria-label={name}>
            <h3 className={styles.groupTitle}>
              {name}{' '}
              <span className={styles.hint}>
                {on === items.length
                  ? plural(items.length, 'empresa', 'empresas')
                  : `${formatNumber(on)} de ${formatNumber(items.length)} ligadas`}
              </span>
            </h3>
            <ul className={styles.list}>
              {items.map((company) => (
                <CompanyRow key={company.id} company={company} board={name} />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

function CompanyRow({ company, board }: { company: TrackedCompanyDto; board: string }) {
  const now = useNow();
  const update = useUpdateCompany();
  const recheck = useRecheckCompany();
  const remove = useRemoveCompany();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const status = companyStatus(company, board, now);
  const name = company.displayName;

  const onError = (error: Error) => toast.show({ message: error.message, tone: 'error' });

  return (
    <li className={styles.row} data-off={!company.active || undefined}>
      <input
        type="checkbox"
        role="switch"
        className={styles.switch}
        checked={company.active}
        aria-label={`Buscar vagas da ${name}`}
        onChange={(event) =>
          update.mutate({ id: company.id, active: event.target.checked }, { onError })
        }
      />
      <div className={styles.rowText}>
        <span className={styles.rowTitle}>
          <strong>{name}</strong>
          {company.boardUrl ? (
            <a href={company.boardUrl} target="_blank" rel="noreferrer" className={styles.slug}>
              {company.slug}
              <ExternalLink size={12} aria-hidden="true" />
              <span className="sr-only"> (abre o board numa nova aba)</span>
            </a>
          ) : (
            <span className={styles.slug}>{company.slug}</span>
          )}
        </span>
        <span className={styles.status} data-tone={status.tone ?? undefined}>
          {status.text}
        </span>
      </div>

      {confirming ? (
        <div className={styles.confirm} role="group" aria-label={`Remover ${name}?`}>
          <span className={styles.hint}>Remover?</span>
          <Button
            variant="primary"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(company.id, {
                onSuccess: () => toast.show({ message: `${name} removida da lista.` }),
                onError: (error) => {
                  setConfirming(false);
                  onError(error);
                },
              })
            }
          >
            Sim, remover
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={`Ler o board da ${name} agora`}
            title="Ler o board agora"
            disabled={recheck.isPending}
            data-busy={recheck.isPending || undefined}
            onClick={() => recheck.mutate(company.id, { onError })}
          >
            <RefreshCw size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={`Remover ${name}`}
            title="Remover da lista"
            onClick={() => setConfirming(true)}
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </li>
  );
}

/* --------------------------------------------------------- diretório */

const REGIONS: { id: DirectoryRegion | 'all'; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'br', label: 'Brasileiras' },
  { id: 'remote', label: 'De fora, remoto' },
];

function Directory({ boards }: { boards: SourceInfoDto[] }) {
  const directory = useCompanyDirectory();
  const add = useAddCompany();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState<DirectoryRegion | 'all'>('all');
  const searchId = useId();

  const shown = useMemo(
    () => filterDirectory(directory.data?.companies ?? [], search, region),
    [directory.data, search, region],
  );
  const adding = add.isPending ? add.variables : undefined;

  if (directory.isPending) return <p className={styles.hint}>Carregando…</p>;
  if (directory.isError) return <p className={styles.error}>{directory.error.message}</p>;

  function follow(company: DirectoryCompanyDto) {
    add.mutate(
      { source: company.source, slug: company.slug, name: company.name },
      {
        onSuccess: (result) =>
          toast.show({ message: addedMessage(result.company, result.jobsNew), tone: 'success' }),
        onError: (error) => toast.show({ message: error.message, tone: 'error' }),
      },
    );
  }

  return (
    <>
      <p className={styles.hint}>
        {plural(directory.data.companies.length, 'empresa conferida', 'empresas conferidas')} em{' '}
        {dayMonthYear(directory.data.verifiedAt)}: o board respondeu e tinha vagas no Brasil ou
        remotas para a América Latina. Boards mudam — se uma sair do ATS, ela aparece como "não
        encontrada" na sua lista.
      </p>

      <div className={styles.directoryTools}>
        <label htmlFor={searchId} className="sr-only">
          Buscar no diretório
        </label>
        <input
          id={searchId}
          type="search"
          className={styles.input}
          placeholder="Buscar por nome ou área (fintech, jogos…)"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className={styles.regions} role="group" aria-label="Origem">
          {REGIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.region}
              aria-pressed={region === item.id}
              onClick={() => setRegion(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <p className="sr-only" role="status">
        {plural(shown.length, 'empresa', 'empresas')}
      </p>

      {shown.length === 0 ? (
        <p className={styles.hint}>Nenhuma empresa com esse filtro.</p>
      ) : (
        <ul className={styles.list}>
          {shown.map((company) => {
            const key = `${company.source}:${company.slug}`;
            const busy = adding?.source === company.source && adding.slug === company.slug;
            return (
              <li key={key} className={styles.row}>
                <div className={styles.rowText}>
                  <span className={styles.rowTitle}>
                    <strong>{company.name}</strong>
                    {company.boardUrl && (
                      <a
                        href={company.boardUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.slug}
                        aria-label={`Board da ${company.name} (nova aba)`}
                      >
                        <ExternalLink size={12} aria-hidden="true" />
                      </a>
                    )}
                  </span>
                  <span className={styles.status}>
                    {company.segment} · {boardName(company.source, boards)}
                    {company.region === 'remote' && ' · remoto'}
                  </span>
                </div>
                {company.trackedId ? (
                  <span className={styles.tracked}>
                    <Check size={14} aria-hidden="true" /> Na lista
                  </span>
                ) : (
                  <Button
                    className={styles.followButton}
                    disabled={add.isPending}
                    aria-label={`Acompanhar ${company.name}`}
                    onClick={() => follow(company)}
                  >
                    {busy ? 'Conferindo…' : 'Acompanhar'}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
