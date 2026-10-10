import { buildSources, createHttpClient, type JobSource } from '@busca-vagas/sources';
import { Logger, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { SOURCE_HTTP_CLIENT, SOURCES } from './discovery.constants';

/**
 * Cria as fontes ativas a partir do registro do pacote `sources`. Cada fonte
 * lê a própria configuração do `.env` (GUPY_*...). Fonte com configuração
 * inválida fica de fora com aviso — a API sobe com as outras.
 */
export const sourcesProvider: Provider = {
  provide: SOURCES,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): JobSource[] => {
    const logger = new Logger('Discovery');
    const result = buildSources(process.env, config.get('DISCOVERY_SOURCES', { infer: true }));

    for (const id of result.unknown) {
      logger.warn(`DISCOVERY_SOURCES cita "${id}", que não existe. Ignorada.`);
    }
    for (const error of result.errors) {
      logger.error(`Fonte "${error.sourceId}" desativada: ${error.message}`);
    }

    logger.log(`Fontes ativas: ${result.sources.map((s) => s.id).join(', ') || '(nenhuma)'}`);
    return result.sources;
  },
};

export const sourceHttpClientProvider: Provider = {
  provide: SOURCE_HTTP_CLIENT,
  useFactory: () => createHttpClient(),
};
