import type { DirectoryRegion } from '@busca-vagas/shared';

/**
 * Diretório embutido: empresas cujo board público foi conferido na API do
 * ATS (o slug respondeu e havia vagas no Brasil ou abertas à América Latina).
 * É só um atalho para a lista — "Acompanhar" copia a empresa para o banco.
 *
 * Para atualizar: confira cada board (`pnpm --filter @busca-vagas/sources try
 * <fonte> <slug> --no-filter`), ajuste a lista e a data. Empresa que saiu do
 * ATS aparece na tela como "não encontrada (404)" depois da primeira busca.
 * Ver docs/features/06-company-boards.md.
 */
export const DIRECTORY_VERIFIED_AT = '2026-10-12';

export interface DirectoryEntry {
  source: 'greenhouse' | 'lever' | 'ashby';
  slug: string;
  name: string;
  segment: string;
  region: DirectoryRegion;
}

export const COMPANY_DIRECTORY: readonly DirectoryEntry[] = [
  // ------------------------------------------------ brasileiras / time no Brasil
  { source: 'greenhouse', slug: 'c6bank', name: 'C6 Bank', segment: 'banco digital', region: 'br' },
  { source: 'greenhouse', slug: 'clara', name: 'Clara', segment: 'fintech', region: 'br' },
  { source: 'greenhouse', slug: 'ebanx', name: 'EBANX', segment: 'pagamentos', region: 'br' },
  { source: 'greenhouse', slug: 'inter', name: 'Inter', segment: 'banco digital', region: 'br' },
  {
    source: 'greenhouse',
    slug: 'jusbrasil',
    name: 'Jusbrasil',
    segment: 'legaltech',
    region: 'br',
  },
  {
    source: 'greenhouse',
    slug: 'quintoandar',
    name: 'QuintoAndar',
    segment: 'imóveis',
    region: 'br',
  },
  {
    source: 'greenhouse',
    slug: 'rdstation',
    name: 'RD Station',
    segment: 'marketing (SaaS)',
    region: 'br',
  },
  { source: 'greenhouse', slug: 'stone', name: 'Stone', segment: 'pagamentos', region: 'br' },
  { source: 'greenhouse', slug: 'vtex', name: 'VTEX', segment: 'e-commerce (SaaS)', region: 'br' },
  {
    source: 'greenhouse',
    slug: 'gympass',
    name: 'Wellhub (Gympass)',
    segment: 'bem-estar corporativo',
    region: 'br',
  },
  {
    source: 'greenhouse',
    slug: 'wildlifestudios',
    name: 'Wildlife Studios',
    segment: 'jogos',
    region: 'br',
  },
  { source: 'lever', slug: 'ciandt', name: 'CI&T', segment: 'consultoria de TI', region: 'br' },
  { source: 'lever', slug: 'cloudwalk', name: 'CloudWalk', segment: 'pagamentos', region: 'br' },
  { source: 'lever', slug: 'dlocal', name: 'dLocal', segment: 'pagamentos', region: 'br' },
  { source: 'lever', slug: 'flashapp', name: 'Flash', segment: 'benefícios', region: 'br' },
  { source: 'lever', slug: 'neon', name: 'Neon', segment: 'banco digital', region: 'br' },
  {
    source: 'lever',
    slug: 'oowlish',
    name: 'Oowlish',
    segment: 'software sob medida',
    region: 'br',
  },
  {
    source: 'lever',
    slug: 'starkbank',
    name: 'Stark Bank',
    segment: 'banco digital',
    region: 'br',
  },
  { source: 'lever', slug: 'swile', name: 'Swile', segment: 'benefícios', region: 'br' },
  { source: 'lever', slug: 'tractian', name: 'Tractian', segment: 'IoT industrial', region: 'br' },
  { source: 'ashby', slug: 'belvo', name: 'Belvo', segment: 'open finance', region: 'br' },
  { source: 'ashby', slug: 'loft', name: 'Loft', segment: 'imóveis', region: 'br' },
  { source: 'ashby', slug: 'nubank', name: 'Nubank', segment: 'banco digital', region: 'br' },

  // ------------------------------------- de fora, contratando remoto na América Latina
  { source: 'greenhouse', slug: 'airbnb', name: 'Airbnb', segment: 'viagens', region: 'remote' },
  { source: 'greenhouse', slug: 'brex', name: 'Brex', segment: 'fintech', region: 'remote' },
  {
    source: 'greenhouse',
    slug: 'canonical',
    name: 'Canonical',
    segment: 'open source (Ubuntu)',
    region: 'remote',
  },
  { source: 'greenhouse', slug: 'coinbase', name: 'Coinbase', segment: 'cripto', region: 'remote' },
  { source: 'greenhouse', slug: 'consensys', name: 'Consensys', segment: 'web3', region: 'remote' },
  {
    source: 'greenhouse',
    slug: 'datadog',
    name: 'Datadog',
    segment: 'observabilidade',
    region: 'remote',
  },
  {
    source: 'greenhouse',
    slug: 'elastic',
    name: 'Elastic',
    segment: 'busca e dados',
    region: 'remote',
  },
  { source: 'greenhouse', slug: 'gitlab', name: 'GitLab', segment: 'DevOps', region: 'remote' },
  {
    source: 'greenhouse',
    slug: 'mozilla',
    name: 'Mozilla',
    segment: 'navegador',
    region: 'remote',
  },
  {
    source: 'greenhouse',
    slug: 'sourcegraph91',
    name: 'Sourcegraph',
    segment: 'ferramentas dev',
    region: 'remote',
  },
  {
    source: 'greenhouse',
    slug: 'turing',
    name: 'Turing',
    segment: 'IA e talentos',
    region: 'remote',
  },
  {
    source: 'greenhouse',
    slug: 'twilio',
    name: 'Twilio',
    segment: 'comunicação (API)',
    region: 'remote',
  },
  {
    source: 'greenhouse',
    slug: 'wikimedia',
    name: 'Wikimedia',
    segment: 'sem fins lucrativos',
    region: 'remote',
  },
  {
    source: 'lever',
    slug: 'toptal',
    name: 'Toptal',
    segment: 'rede de freelancers',
    region: 'remote',
  },
  {
    source: 'ashby',
    slug: 'duck-duck-go',
    name: 'DuckDuckGo',
    segment: 'busca e privacidade',
    region: 'remote',
  },
  { source: 'ashby', slug: 'kraken.com', name: 'Kraken', segment: 'cripto', region: 'remote' },
  { source: 'ashby', slug: 'railway', name: 'Railway', segment: 'cloud', region: 'remote' },
  { source: 'ashby', slug: 'resend', name: 'Resend', segment: 'e-mail (API)', region: 'remote' },
  {
    source: 'ashby',
    slug: 'supabase',
    name: 'Supabase',
    segment: 'banco de dados',
    region: 'remote',
  },
  { source: 'ashby', slug: 'zed', name: 'Zed', segment: 'editor de código', region: 'remote' },
];
