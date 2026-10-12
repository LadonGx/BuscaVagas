import { z } from 'zod';

/**
 * Empresas acompanhadas nos boards (Greenhouse, Lever, Ashby) e o diretório
 * embutido de empresas verificadas.
 * Plano: docs/features/06-company-boards.md
 */

/** O final da URL do board (`jobs.lever.co/<slug>`). */
export const COMPANY_SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

export const COMPANY_CHECK_STATUSES = ['ok', 'not_found', 'failed'] as const;
export type CompanyCheckStatus = (typeof COMPANY_CHECK_STATUSES)[number];

/** `br` = empresa brasileira (ou com time grande aqui); `remote` = de fora, contrata remoto na América Latina. */
export const DIRECTORY_REGIONS = ['br', 'remote'] as const;
export type DirectoryRegion = (typeof DIRECTORY_REGIONS)[number];

/* ------------------------------------------------------------- entrada */

const slug = z
  .string()
  .trim()
  .regex(COMPANY_SLUG_PATTERN, 'Use o final do link do board (ex.: "minha-empresa")');

/**
 * Qual board: o link (`url`) OU a fonte e o slug. Com o link, a API descobre
 * a fonte e o slug sozinha.
 */
const boardRefShape = {
  url: z.string().trim().min(1).max(500).optional(),
  source: z.string().trim().min(1).max(50).optional(),
  slug: slug.optional(),
};

const needsBoard = (value: { url?: string; source?: string; slug?: string }) =>
  Boolean(value.url) || Boolean(value.source && value.slug);
const needsBoardIssue = {
  message: 'Informe o link do board ou a fonte e o slug',
  path: ['url'],
};

export const checkCompanyInputSchema = z.object(boardRefShape).refine(needsBoard, needsBoardIssue);
export type CheckCompanyInput = z.output<typeof checkCompanyInputSchema>;

export const addCompanyInputSchema = z
  .object({
    ...boardRefShape,
    /** Nome exibido. Ausente = o da API do board ou o derivado do slug. */
    name: z.string().trim().min(1).max(100).optional(),
  })
  .refine(needsBoard, needsBoardIssue);
export type AddCompanyInput = z.output<typeof addCompanyInputSchema>;

export const updateCompanyInputSchema = z
  .object({
    active: z.boolean().optional(),
    /** `null` volta ao nome automático. */
    name: z.string().trim().min(1).max(100).nullable().optional(),
  })
  .refine((value) => value.active !== undefined || value.name !== undefined, {
    message: 'Nada para alterar',
  });
export type UpdateCompanyInput = z.output<typeof updateCompanyInputSchema>;

/* --------------------------------------------------------------- saída */

export interface TrackedCompanyDto {
  id: string;
  /** Id da fonte: "greenhouse", "lever", "ashby". */
  source: string;
  slug: string;
  /** Nome escolhido; `null` = automático (ver `displayName`). */
  name: string | null;
  displayName: string;
  /** Desligada = continua na lista, mas fica fora das buscas. */
  active: boolean;
  /** Página pública do board. */
  boardUrl: string | null;
  /** Última vez que o board foi lido (busca ou conferência). */
  lastCheckedAt: string | null;
  lastStatus: CompanyCheckStatus | null;
  /** Vagas que o board tinha na última leitura. */
  lastJobs: number | null;
  /** Quantas passaram nos filtros de título e local. */
  lastMatched: number | null;
  lastError: string | null;
  createdAt: string;
}

/** Resultado de ler um board agora, sem gravar nada. */
export interface CompanyCheckDto {
  source: string;
  slug: string;
  status: CompanyCheckStatus;
  jobs: number;
  matched: number;
  error: string | null;
  boardUrl: string | null;
  /** Já está na lista? */
  trackedId: string | null;
}

export interface AddCompanyResultDto {
  company: TrackedCompanyDto;
  /** Vagas que entraram agora, lidas na conferência do board. */
  jobsNew: number;
}

export interface DirectoryCompanyDto {
  source: string;
  slug: string;
  name: string;
  /** Área, em poucas palavras ("fintech", "jogos"). */
  segment: string;
  region: DirectoryRegion;
  boardUrl: string | null;
  /** Id na lista de acompanhadas, se já estiver lá. */
  trackedId: string | null;
}

export interface CompanyDirectoryDto {
  /** Quando os boards do diretório foram conferidos (AAAA-MM-DD). */
  verifiedAt: string;
  companies: DirectoryCompanyDto[];
}
