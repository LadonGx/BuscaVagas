import {
  isPreferencesConfigured,
  type PreferencesDto,
  type PreferencesInput,
  type PutPreferencesResultDto,
  type RescoreResultDto,
  type StackOptionDto,
} from '@busca-vagas/shared';
import { KNOWN_TECHNOLOGIES } from '@busca-vagas/sources';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SCORE_REQUESTER, type ScoreRequester } from '../scoring/scoring.constants';
import { loadPreferences, PREFERENCES_ID, type StoredPreferences } from './preferences.store';

const KNOWN = new Set(KNOWN_TECHNOLOGIES);

/** Plano: docs/features/07-preferences-score.md */
@Injectable()
export class PreferencesService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(SCORE_REQUESTER) private readonly scoring?: ScoreRequester,
  ) {}

  async get(): Promise<PreferencesDto> {
    return toDto(await loadPreferences(this.prisma));
  }

  /**
   * Substitui as preferências e sobe a versão. As notas são recalculadas em
   * segundo plano: a resposta volta na hora, e até o recálculo terminar as
   * vagas mostram a nota anterior.
   */
  async put(input: PreferencesInput): Promise<PutPreferencesResultDto> {
    const row = await this.prisma.preferences.upsert({
      where: { id: PREFERENCES_ID },
      create: { id: PREFERENCES_ID, ...input, version: 1 },
      update: { ...input, version: { increment: 1 } },
    });

    const rescoreQueued = (await this.scoring?.request('preferences')) ?? false;
    return {
      ...toDto({ values: input, version: row.version, updatedAt: row.updatedAt }),
      rescoreQueued,
    };
  }

  async rescore(): Promise<RescoreResultDto> {
    // Recalcular tudo = invalidar todas as notas; a fila faz o resto. SQL
    // direto para não mexer no `updatedAt` (não é uma edição da vaga).
    await this.prisma.$executeRaw`UPDATE "Job" SET "scoredVersion" = NULL`;
    return { queued: (await this.scoring?.request('manual')) ?? false };
  }

  /** Tecnologias conhecidas + as que aparecem nas vagas, com a contagem. */
  async stacks(): Promise<StackOptionDto[]> {
    const counts = await this.prisma.$queryRaw<{ name: string; jobs: number }[]>`
      SELECT tech AS name, COUNT(*)::int AS jobs
      FROM "Job", unnest("stack") AS tech
      WHERE "triage" <> 'dismissed'
      GROUP BY tech`;
    const byName = new Map(counts.map((row) => [row.name, row.jobs]));
    const names = new Set([...KNOWN_TECHNOLOGIES, ...byName.keys()]);

    return [...names]
      .map((name) => ({ name, known: KNOWN.has(name), jobs: byName.get(name) ?? 0 }))
      .sort((a, b) => b.jobs - a.jobs || a.name.localeCompare(b.name));
  }
}

function toDto(stored: StoredPreferences): PreferencesDto {
  const { values } = stored;
  const lists = [...values.stacksCore, ...values.stacksPlus, ...values.stacksAvoid];
  return {
    ...values,
    configured: isPreferencesConfigured(values),
    version: stored.version,
    updatedAt: stored.updatedAt?.toISOString() ?? null,
    unknownStacks: [...new Set(lists.filter((tech) => !KNOWN.has(tech)))],
  };
}
