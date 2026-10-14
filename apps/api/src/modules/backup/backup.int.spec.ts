import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BackupInspectDto, BackupRestoreResultDto } from '@busca-vagas/shared';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestApp, describeDb, resetDatabase, type TestApp } from '../../../test/helpers';
import { Prisma } from '../../generated/prisma/client';
import { BACKUP_TABLES, NULLABLE_JSON_FIELDS } from './backup.service';
import { BackupModule } from './backup.module';

const PDF = Buffer.from('%PDF-1.4\n% backup\n%%EOF\n', 'latin1');

/** supertest: corpo binário inteiro. */
const binary = (response: request.Response, done: (error: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  const stream = response as unknown as NodeJS.ReadableStream;
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  stream.on('end', () => done(null, Buffer.concat(chunks)));
};

describeDb('Backup (integração)', () => {
  let t: TestApp;
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'busca-vagas-backup-'));
    t = await createTestApp([BackupModule], { BACKUP_DIR: dir });
  });

  afterAll(async () => {
    await t.close();
    rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });

  const api = () => request(t.http);

  /** Um pouco de tudo, inclusive repostagem, PDF, JSON nulo e cópia do currículo. */
  async function seed() {
    await t.prisma.systemFlag.create({ data: { key: 'interview-seeds' } });
    await t.prisma.preferences.create({ data: { id: 1, stacksCore: ['react'], version: 3 } });
    const section = await t.prisma.resumeSection.create({
      data: {
        title: 'Contato',
        kind: 'fields',
        position: 0,
        items: { create: { position: 0, data: { label: 'E-mail', value: 'ana@example.com' } } },
      },
    });
    const snapshot = await t.prisma.resumeSnapshot.create({
      data: { hash: 'abc', sections: [{ id: section.id, title: 'Contato' }] },
    });
    const original = await t.prisma.job.create({
      data: {
        source: 'gupy',
        title: 'Dev Júnior',
        company: 'Acme',
        url: 'https://acme.gupy.io/jobs/1',
        stack: ['react'],
        scoreReasons: Prisma.DbNull,
      },
    });
    const repost = await t.prisma.job.create({
      data: {
        source: 'gupy',
        title: 'Dev Júnior',
        company: 'Acme',
        url: 'https://acme.gupy.io/jobs/2',
        repostOfId: original.id,
        score: 900,
        scoreReasons: [{ criterion: 'stack', kind: 'plus', text: 'React' }],
      },
    });
    const application = await t.prisma.application.create({
      data: {
        jobId: repost.id,
        status: 'in_process',
        appliedAt: new Date('2026-10-01T13:00:00.000Z'),
        notes: 'Falar com a Ana; "ligar" depois',
        resumeSnapshotId: snapshot.id,
        resumeSavedAt: new Date('2026-10-01T13:00:00.000Z'),
        events: {
          create: [
            { status: 'applied', occurredAt: new Date('2026-10-01T13:00:00.000Z') },
            { status: 'in_process', occurredAt: new Date('2026-10-03T13:00:00.000Z') },
          ],
        },
        resumeFile: { create: { name: 'cv.pdf', size: PDF.length, sha256: 'x', content: PDF } },
      },
    });
    const question = await t.prisma.interviewQuestion.create({
      data: { question: 'Fale de você.', category: 'hr', tags: ['rh'] },
    });
    await t.prisma.interviewAsked.create({
      data: { questionId: question.id, applicationId: application.id, note: 'ok' },
    });
    return { original, repost, application };
  }

  async function download(): Promise<Buffer> {
    const response = await api().get('/api/backup').buffer(true).parse(binary).expect(200);
    expect(response.headers['content-type']).toBe('application/zip');
    expect(response.headers['content-disposition']).toMatch(
      /attachment; filename="buscavagas-backup-\d{8}-\d{4}\.zip"/,
    );
    return response.body as Buffer;
  }

  it('todos os modelos do Prisma entram no backup; Json? listados', () => {
    expect([...BACKUP_TABLES].sort()).toEqual(Object.values(Prisma.ModelName).sort());
    const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
    const found: Record<string, string[]> = {};
    let model = '';
    for (const line of schema.split('\n')) {
      const header = /^model (\w+)/.exec(line);
      if (header) model = header[1]!;
      const field = /^\s+(\w+)\s+Json\?/.exec(line);
      if (field) (found[model] ??= []).push(field[1]!);
    }
    expect(found).toEqual(NULLABLE_JSON_FIELDS);
  });

  it('exporta, apaga tudo e restaura igual — inclusive PDF, repostagem e JSON nulo', async () => {
    const { original, repost, application } = await seed();
    const zip = await download();

    const files = unzipSync(new Uint8Array(zip));
    const manifest = JSON.parse(strFromU8(files['manifest.json']!)) as Record<string, unknown>;
    expect(manifest).toMatchObject({ app: 'BuscaVagas', format: 1, migrations: null });
    expect(manifest.counts).toMatchObject({ Job: 2, Application: 1, ApplicationFile: 1 });
    expect(
      Buffer.from(files[`files/${(await t.prisma.applicationFile.findFirstOrThrow()).id}.pdf`]!),
    ).toEqual(PDF);

    const inspect = (
      await api()
        .post('/api/backup/inspect')
        .set('Content-Type', 'application/zip')
        .send(zip)
        .expect(200)
    ).body as BackupInspectDto;
    expect(inspect.problem).toBeNull();
    expect(inspect.manifest.counts.InterviewQuestion).toBe(1);

    // Muda tudo depois do backup.
    await t.prisma.job.create({ data: { source: 'manual', title: 'Nova', company: 'X' } });
    await t.prisma.application.update({ where: { id: application.id }, data: { notes: 'mudou' } });

    const result = (
      await api()
        .post('/api/backup/restore')
        .set('Content-Type', 'application/zip')
        .send(zip)
        .expect(200)
    ).body as BackupRestoreResultDto;
    expect(result.restored).toMatchObject({
      Job: 2,
      Application: 1,
      StatusEvent: 2,
      InterviewAsked: 1,
    });

    expect(await t.prisma.job.count()).toBe(2);
    const restoredRepost = await t.prisma.job.findUniqueOrThrow({ where: { id: repost.id } });
    expect(restoredRepost.repostOfId).toBe(original.id);
    // Ligar a repostagem não conta como edição da vaga.
    expect(restoredRepost.updatedAt).toEqual(repost.updatedAt);
    expect(restoredRepost.scoreReasons).toEqual([
      { criterion: 'stack', kind: 'plus', text: 'React' },
    ]);
    expect(
      (await t.prisma.job.findUniqueOrThrow({ where: { id: original.id } })).scoreReasons,
    ).toBeNull();
    const restoredApplication = await t.prisma.application.findUniqueOrThrow({
      where: { id: application.id },
      include: { resumeFile: true, events: true },
    });
    expect(restoredApplication.notes).toBe('Falar com a Ana; "ligar" depois');
    expect(Buffer.from(restoredApplication.resumeFile!.content)).toEqual(PDF);
    expect(restoredApplication.events).toHaveLength(2);
    expect(await t.prisma.systemFlag.count()).toBe(1);
    expect((await t.prisma.preferences.findUniqueOrThrow({ where: { id: 1 } })).version).toBe(3);

    // A cópia do que havia antes ficou na pasta, com a vaga "Nova".
    expect(result.safetyBackup).toMatch(/^buscavagas-antes-de-restaurar-\d{8}-\d{4}\.zip$/);
    expect(readdirSync(dir)).toContain(result.safetyBackup);
    const safety = unzipSync(new Uint8Array(readFileSync(join(dir, result.safetyBackup))));
    expect(strFromU8(safety['data/Job.json']!)).toContain('"title":"Nova"');
  });

  it('recusa o que não é backup e não mexe em nada', async () => {
    await seed();
    const notZip = await api()
      .post('/api/backup/restore')
      .set('Content-Type', 'application/zip')
      .send(Buffer.from('não é zip'))
      .expect(400);
    expect(notZip.body.message).toBe('Isso não é um .zip válido.');

    const otherZip = Buffer.from(zipSync({ 'leia.txt': strToU8('oi') }));
    const noManifest = await api()
      .post('/api/backup/inspect')
      .set('Content-Type', 'application/zip')
      .send(otherZip)
      .expect(400);
    expect(noManifest.body.message).toMatch(/não é um backup do BuscaVagas/);

    const newer = Buffer.from(
      zipSync({
        'manifest.json': strToU8(
          JSON.stringify({
            app: 'BuscaVagas',
            format: 99,
            createdAt: '',
            migrations: null,
            counts: {},
          }),
        ),
      }),
    );
    const inspect = (
      await api()
        .post('/api/backup/inspect')
        .set('Content-Type', 'application/zip')
        .send(newer)
        .expect(200)
    ).body as BackupInspectDto;
    expect(inspect.problem).toMatch(/versão mais nova/);
    await api()
      .post('/api/backup/restore')
      .set('Content-Type', 'application/zip')
      .send(newer)
      .expect(400);

    await api().post('/api/backup/restore').set('Content-Type', 'application/zip').expect(400);
    expect(await t.prisma.job.count()).toBe(2);
  });

  it('dado quebrado no meio: transação desfaz, nada muda', async () => {
    await seed();
    const files = unzipSync(new Uint8Array(await download()));
    const jobs = JSON.parse(strFromU8(files['data/Job.json']!)) as Record<string, unknown>[];
    files['data/Job.json'] = strToU8(
      JSON.stringify([...jobs, { ...jobs[0], campoQueNaoExiste: 1 }]),
    );
    await t.prisma.job.create({ data: { source: 'manual', title: 'Fica', company: 'X' } });

    const response = await api()
      .post('/api/backup/restore')
      .set('Content-Type', 'application/zip')
      .send(Buffer.from(zipSync(files)))
      .expect(400);
    expect(response.body.message).toMatch(/nada foi mudado/);
    expect(await t.prisma.job.count()).toBe(3);
  });

  it('CSV das candidaturas: BOM, ponto e vírgula, aspas e datas', async () => {
    await seed();
    const response = await api().get('/api/backup/applications.csv').expect(200);
    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
    const text = response.text;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const [header, row] = text.slice(1).trim().split('\r\n');
    expect(header).toBe(
      'Vaga;Empresa;Status;Aplicada em;Última atualização;Fonte;Onde se candidatou;Pretensão (R$);Próxima etapa;O que é a próxima etapa;Anotações;Link',
    );
    expect(row).toMatch(
      /^Dev Júnior;Acme;Em processo;01\/10\/2026;\d\d\/\d\d\/\d{4};Gupy;;;;;"Falar com a Ana; ""ligar"" depois";https:\/\/acme\.gupy\.io\/jobs\/2$/,
    );
  });
});
