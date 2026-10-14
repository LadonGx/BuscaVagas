import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  BACKUP_FORMAT,
  type BackupInspectDto,
  type BackupManifest,
  type BackupRestoreResultDto,
} from '@busca-vagas/shared';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import type { Env } from '../../config/env';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type Row = Record<string, unknown>;
type Client = Prisma.TransactionClient | PrismaService;

interface Delegate {
  findMany(args?: object): Promise<Row[]>;
  createMany(args: { data: Row[] }): Promise<{ count: number }>;
}

/**
 * Todas as tabelas, na ordem de restaurar (quem é referenciado vem antes).
 * O teste confere que nenhum modelo do Prisma ficou de fora: tabela nova
 * sem entrar aqui quebra o teste, não o backup.
 */
export const BACKUP_TABLES = [
  'SystemFlag',
  'Preferences',
  'NotificationSettings',
  'TrackedCompany',
  'SourceRun',
  'ForgottenJob',
  'MutedRepost',
  'ResumeSection',
  'ResumeItem',
  'ResumeSnapshot',
  'Notification',
  'Job',
  'JobAlias',
  'Application',
  'StatusEvent',
  'ApplicationFile',
  'InterviewQuestion',
  'InterviewAsked',
] as const satisfies readonly Prisma.ModelName[];

/**
 * Campos `Json?`: no createMany, `null` tem de virar `Prisma.DbNull` (o Prisma
 * não sabe se é "null do banco" ou "o JSON null"). O teste confere a lista.
 */
export const NULLABLE_JSON_FIELDS: Partial<Record<(typeof BACKUP_TABLES)[number], string[]>> = {
  Job: ['scoreReasons'],
};

/** Lotes do createMany (o Postgres aceita até 65 535 parâmetros por comando). */
const CHUNK = 500;
const delegate = (client: Client, table: string) =>
  (client as unknown as Record<string, Delegate>)[table.charAt(0).toLowerCase() + table.slice(1)]!;

const stamp = (date: Date) =>
  date.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');

/** `buscavagas-backup-20261014-1530.zip`. */
export const backupFileName = (date: Date, prefix = 'backup') =>
  `buscavagas-${prefix}-${stamp(date)}.zip`;

/**
 * Backup e restauração (docs/features/18-backup.md).
 *
 * O .zip tem `manifest.json`, `data/<Tabela>.json` (as linhas, como o
 * Prisma devolve) e `files/<id>.pdf` (os PDFs enviados, fora do JSON).
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger('Backup');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async export(now = new Date()): Promise<Uint8Array> {
    const files: Zippable = {};
    const counts: Record<string, number> = {};

    for (const table of BACKUP_TABLES) {
      const rows = await delegate(this.prisma, table).findMany();
      counts[table] = rows.length;
      const data = rows.map((row) => {
        if (table !== 'ApplicationFile') return row;
        const { content, ...rest } = row as Row & { content: Uint8Array; id: string };
        const path = `files/${rest.id}.pdf`;
        files[path] = [new Uint8Array(content), { level: 0 }]; // PDF já é comprimido
        return { ...rest, contentFile: path };
      });
      files[`data/${table}.json`] = strToU8(JSON.stringify(data));
    }

    const manifest: BackupManifest = {
      app: 'BuscaVagas',
      format: BACKUP_FORMAT,
      createdAt: now.toISOString(),
      migrations: await this.migrations(),
      counts,
    };
    files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
    return zipSync(files, { level: 6, mtime: now });
  }

  /** Lê o arquivo e diz se dá para restaurar, sem mexer em nada. */
  async inspect(zip: Uint8Array): Promise<BackupInspectDto> {
    const { manifest } = this.open(zip);
    return { manifest, problem: await this.problem(manifest) };
  }

  /**
   * Troca tudo pelo backup, numa transação só (deu erro, nada muda). Antes,
   * guarda uma cópia do que havia em BACKUP_DIR.
   */
  async restore(zip: Uint8Array, now = new Date()): Promise<BackupRestoreResultDto> {
    const { manifest, files } = this.open(zip);
    const problem = await this.problem(manifest);
    if (problem) throw new BadRequestException({ statusCode: 400, message: problem });

    const tables = BACKUP_TABLES.map((table) => ({ table, rows: this.rows(files, table) }));
    const safetyBackup = await this.saveSafetyCopy(now);

    const restored: Record<string, number> = {};
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const list = BACKUP_TABLES.map((table) => `"public"."${table}"`).join(', ');
          await tx.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);

          const reposts: { id: string; repostOfId: string }[] = [];
          for (const { table, rows } of tables) {
            const jsonFields = NULLABLE_JSON_FIELDS[table] ?? [];
            const data = rows.map((original) => {
              const row = { ...original };
              for (const field of jsonFields) if (row[field] === null) row[field] = Prisma.DbNull;
              if (table === 'Job' && row.repostOfId) {
                // Vaga que aponta para outra vaga: liga depois que todas existirem.
                reposts.push({ id: String(row.id), repostOfId: String(row.repostOfId) });
                return { ...row, repostOfId: null };
              }
              return row;
            });
            for (let start = 0; start < data.length; start += CHUNK) {
              await delegate(tx, table).createMany({ data: data.slice(start, start + CHUNK) });
            }
            restored[table] = data.length;
          }
          // SQL direto: o update do Prisma mexeria no `updatedAt` (@updatedAt).
          for (const { id, repostOfId } of reposts) {
            await tx.$executeRaw`UPDATE "Job" SET "repostOfId" = ${repostOfId} WHERE id = ${id}`;
          }
        },
        { timeout: 10 * 60_000, maxWait: 30_000 },
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message.split('\n').at(-1) : String(error);
      throw new BadRequestException({
        statusCode: 400,
        message: `Não consegui restaurar; nada foi mudado. O arquivo não combina com esta versão do banco (${reason}).`,
      });
    }

    this.logger.log(
      `Backup de ${manifest.createdAt} restaurado. Cópia do que havia antes: ${safetyBackup}`,
    );
    return { restored, safetyBackup };
  }

  /* ----------------------------------------------------------- internos */

  private open(zip: Uint8Array): { manifest: BackupManifest; files: Record<string, Uint8Array> } {
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(zip);
    } catch {
      throw new BadRequestException({ statusCode: 400, message: 'Isso não é um .zip válido.' });
    }
    const raw = files['manifest.json'];
    let manifest: BackupManifest | null;
    try {
      manifest = raw ? (JSON.parse(strFromU8(raw)) as BackupManifest) : null;
    } catch {
      manifest = null;
    }
    if (!manifest || manifest.app !== 'BuscaVagas' || typeof manifest.format !== 'number') {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Este .zip não é um backup do BuscaVagas (falta o manifest.json).',
      });
    }
    return { manifest, files };
  }

  private rows(files: Record<string, Uint8Array>, table: string): Row[] {
    const raw = files[`data/${table}.json`];
    if (!raw) return []; // tabela que não existia quando o backup foi feito
    const rows = JSON.parse(strFromU8(raw)) as Row[];
    if (table !== 'ApplicationFile') return rows;
    return rows.map(({ contentFile, ...row }) => {
      const content = files[String(contentFile)];
      if (!content) {
        throw new BadRequestException({
          statusCode: 400,
          message: `Backup incompleto: falta ${String(contentFile)}.`,
        });
      }
      return { ...row, content };
    });
  }

  private async problem(manifest: BackupManifest): Promise<string | null> {
    if (manifest.format > BACKUP_FORMAT) {
      return 'Backup feito por uma versão mais nova do app. Atualize o app antes de restaurar.';
    }
    const current = await this.migrations();
    if (current && manifest.migrations) {
      const unknown = manifest.migrations.filter((name) => !current.includes(name));
      if (unknown.length > 0) {
        return `Backup de um banco mais novo (migração ${unknown.at(-1)}). Rode \`pnpm db:deploy\` com o app atualizado antes de restaurar.`;
      }
    }
    return null;
  }

  /** Migrações aplicadas (null se a tabela do Prisma não existe — ex.: nos testes). */
  private async migrations(): Promise<string[] | null> {
    const [exists] = await this.prisma.$queryRaw<{ table: string | null }[]>`
      SELECT to_regclass('public._prisma_migrations')::text AS table
    `;
    if (!exists?.table) return null;
    const rows = await this.prisma.$queryRaw<{ name: string }[]>`
      SELECT migration_name AS name FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ORDER BY migration_name
    `;
    return rows.map((row) => row.name);
  }

  private async saveSafetyCopy(now: Date): Promise<string> {
    const dir = resolve(process.cwd(), this.config.get('BACKUP_DIR', { infer: true }));
    const name = backupFileName(now, 'antes-de-restaurar');
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, name), await this.export(now));
    return name;
  }
}
