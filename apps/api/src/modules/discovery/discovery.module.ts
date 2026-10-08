import { Module } from '@nestjs/common';

/**
 * Descoberta: ponte entre a API e o pacote @busca-vagas/sources.
 *
 * Aqui vão morar o processador da fila `source-scan` (um job por fonte, com
 * retry e registro em SourceRun) e o agendamento das varreduras. — Fase 1
 */
@Module({})
export class DiscoveryModule {}
