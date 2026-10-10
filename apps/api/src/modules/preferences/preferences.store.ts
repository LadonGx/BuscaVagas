import { EMPTY_PREFERENCES, type PreferencesValues } from '@busca-vagas/shared';
import type { Preferences } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

/** A linha única de preferências. */
export const PREFERENCES_ID = 1;

export interface StoredPreferences {
  values: PreferencesValues;
  /** 0 = nunca salvas. */
  version: number;
  updatedAt: Date | null;
}

/**
 * Lê as preferências. Sem linha no banco = neutras, versão 0. Função solta
 * (não um serviço) para que vagas, nota e preferências leiam do mesmo jeito
 * sem um módulo depender do outro.
 */
export async function loadPreferences(prisma: PrismaService): Promise<StoredPreferences> {
  const row = await prisma.preferences.findUnique({ where: { id: PREFERENCES_ID } });
  return row
    ? { values: toValues(row), version: row.version, updatedAt: row.updatedAt }
    : { values: EMPTY_PREFERENCES, version: 0, updatedAt: null };
}

export function toValues(row: Preferences): PreferencesValues {
  return {
    stacksCore: row.stacksCore,
    stacksPlus: row.stacksPlus,
    stacksAvoid: row.stacksAvoid,
    seniorities: row.seniorities,
    workModels: row.workModels,
    cities: row.cities,
    contractTypes: row.contractTypes,
    maxAgeDays: row.maxAgeDays,
    minMonthlySalary: row.minMonthlySalary,
    blockedCompanies: row.blockedCompanies,
  };
}
