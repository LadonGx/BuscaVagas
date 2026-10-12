import {
  buildSources,
  createHttpClient,
  SOURCE_DEFINITIONS,
  type BuildSourcesResult,
  type CompanyBoardConfig,
  type JobSource,
} from '@busca-vagas/sources';
import { Logger, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import type { CompanySeed } from './companies/tracked-companies.store';
import {
  COMPANY_SEEDS,
  SOURCE_HTTP_CLIENT,
  SOURCE_REGISTRY,
  SOURCES,
  UNAVAILABLE_SOURCES,
  type UnavailableSource,
} from './discovery.constants';

/**
 * Monta as fontes UMA vez a partir do registro do pacote `sources`. Cada
 * fonte lê a própria configuração do `.env` (GUPY_*, GREENHOUSE_*...).
 *
 * Nada aqui derruba a API: fonte com configuração inválida fica de fora com
 * erro no log; fonte sem o que fazer (board sem empresas) fica de fora com um
 * aviso. As duas aparecem em `GET /api/discovery/sources` com o motivo.
 *
 * Os boards de empresa sobem sempre: a lista de empresas fica no banco
 * (`TrackedCompany`) e é lida a cada busca.
 */
export const sourceRegistryProvider: Provider = {
  provide: SOURCE_REGISTRY,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): BuildSourcesResult => {
    const logger = new Logger('Discovery');
    const result = buildSources(process.env, config.get('DISCOVERY_SOURCES', { infer: true }));

    for (const id of result.unknown) {
      logger.warn(`DISCOVERY_SOURCES cita "${id}", que não existe. Ignorada.`);
    }
    for (const error of result.errors) {
      logger.error(`Fonte "${error.sourceId}" desativada: ${error.message}`);
    }
    for (const item of result.inactive) {
      logger.log(`Fonte "${item.sourceId}" inativa: ${item.reason}`);
    }

    logger.log(`Fontes ativas: ${result.sources.map((s) => s.id).join(', ') || '(nenhuma)'}`);
    return result;
  },
};

export const sourcesProvider: Provider = {
  provide: SOURCES,
  inject: [SOURCE_REGISTRY],
  useFactory: (registry: BuildSourcesResult): JobSource[] => registry.sources,
};

export const unavailableSourcesProvider: Provider = {
  provide: UNAVAILABLE_SOURCES,
  inject: [SOURCE_REGISTRY],
  useFactory: (registry: BuildSourcesResult): UnavailableSource[] => [
    ...registry.inactive.map((item) => ({
      id: item.sourceId,
      displayName: item.displayName,
      kind: item.kind,
      reason: item.reason,
    })),
    ...registry.errors.map((item) => ({
      id: item.sourceId,
      displayName: item.displayName,
      kind: item.kind,
      reason: `Configuração inválida: ${item.message}`,
    })),
  ],
};

export const sourceHttpClientProvider: Provider = {
  provide: SOURCE_HTTP_CLIENT,
  useFactory: () => createHttpClient(),
};

/**
 * As empresas do `.env` (`GREENHOUSE_COMPANIES`...) de cada board. Só servem
 * para a importação inicial no banco (`CompaniesSeeder`). Configuração
 * inválida já foi reportada pelo registro: aqui só fica de fora.
 */
export const companySeedsProvider: Provider = {
  provide: COMPANY_SEEDS,
  useFactory: (): CompanySeed[] =>
    SOURCE_DEFINITIONS.filter((definition) => definition.kind === 'company-board').flatMap(
      (definition) => {
        try {
          const config = definition.parseConfig(process.env) as CompanyBoardConfig;
          return [{ sourceId: definition.id, companies: config.companies }];
        } catch {
          return [];
        }
      },
    ),
};
