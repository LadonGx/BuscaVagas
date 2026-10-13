import type { ApplicationDetailDto, JobDto, ResumeSnapshotDto } from '@busca-vagas/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestApp, describeDb, resetDatabase, type TestApp } from '../../../test/helpers';
import { JobsModule } from '../jobs/jobs.module';
import { ApplicationsModule } from './applications.module';

/** Um PDF mínimo (só o começo importa para a checagem). */
const pdf = (extra = '') => Buffer.from(`%PDF-1.4\n% teste ${extra}\n%%EOF\n`, 'latin1');

describeDb('Currículo de cada candidatura (integração)', () => {
  let t: TestApp;
  let n = 0;

  beforeAll(async () => {
    t = await createTestApp([JobsModule, ApplicationsModule]);
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });

  const api = () => request(t.http);

  async function apply(): Promise<ApplicationDetailDto> {
    n += 1;
    const job = (
      await api()
        .post('/api/jobs')
        .send({ title: `Dev ${n}`, company: 'Acme' })
        .expect(201)
    ).body as JobDto;
    return (await api().post('/api/applications').send({ jobId: job.id }).expect(201))
      .body as ApplicationDetailDto;
  }

  /** Currículo com um campo e uma experiência. Devolve o id do campo. */
  async function fillResume(email = 'voce@example.com') {
    const contact = await t.prisma.resumeSection.create({
      data: {
        title: 'Contato',
        kind: 'fields',
        position: 0,
        items: { create: { position: 0, data: { label: 'E-mail', value: email } } },
      },
      include: { items: true },
    });
    await t.prisma.resumeSection.create({
      data: {
        title: 'Experiência',
        kind: 'entries',
        position: 1,
        items: {
          create: {
            position: 0,
            data: { title: 'Desenvolvedor', organization: 'Acme', current: true },
          },
        },
      },
    });
    return contact.items[0]!.id;
  }

  const detail = async (id: string) =>
    (await api().get(`/api/applications/${id}`).expect(200)).body as ApplicationDetailDto;

  it('currículo vazio: candidatura sem cópia', async () => {
    const app = await apply();
    expect(app.resume).toBeNull();
    expect(app.resumeFile).toBeNull();
    await api().get(`/api/applications/${app.id}/resume`).expect(404);
    expect(await t.prisma.resumeSnapshot.count()).toBe(0);
  });

  it('"Me candidatei" guarda o currículo; mudar o currículo depois não muda a cópia', async () => {
    const emailId = await fillResume();
    const app = await apply();

    expect(app.resume).toMatchObject({ sameAsCurrent: true });
    const copy = (await api().get(`/api/applications/${app.id}/resume`).expect(200))
      .body as ResumeSnapshotDto;
    expect(copy.savedAt).toBe(app.resume!.savedAt);
    expect(copy.sections.map((section) => section.title)).toEqual(['Contato', 'Experiência']);
    expect(copy.sections[0]!.items[0]).toMatchObject({
      id: emailId,
      data: { label: 'E-mail', value: 'voce@example.com' },
    });

    await t.prisma.resumeItem.update({
      where: { id: emailId },
      data: { data: { label: 'E-mail', value: 'novo@example.com' } },
    });

    expect((await detail(app.id)).resume).toMatchObject({ sameAsCurrent: false });
    const again = (await api().get(`/api/applications/${app.id}/resume`).expect(200))
      .body as ResumeSnapshotDto;
    expect(again.sections[0]!.items[0]!.data).toEqual({
      label: 'E-mail',
      value: 'voce@example.com',
    });
  });

  it('o mesmo currículo em várias candidaturas vira uma cópia só', async () => {
    const emailId = await fillResume();
    const first = await apply();
    const second = await apply();
    expect(second.resume!.snapshotId).toBe(first.resume!.snapshotId);
    expect(await t.prisma.resumeSnapshot.count()).toBe(1);

    await t.prisma.resumeItem.update({
      where: { id: emailId },
      data: { data: { label: 'E-mail', value: 'outro@example.com' } },
    });
    const third = await apply();
    expect(third.resume!.snapshotId).not.toBe(first.resume!.snapshotId);
    expect(await t.prisma.resumeSnapshot.count()).toBe(2);
  });

  it('"Guardar o currículo de hoje" troca a cópia e apaga a que ficou sem uso', async () => {
    const emailId = await fillResume();
    const app = await apply();
    const old = app.resume!.snapshotId;

    await t.prisma.resumeItem.update({
      where: { id: emailId },
      data: { data: { label: 'E-mail', value: 'hoje@example.com' } },
    });
    const saved = (await api().post(`/api/applications/${app.id}/resume`).expect(200))
      .body as ApplicationDetailDto;

    expect(saved.resume).toMatchObject({ sameAsCurrent: true });
    expect(saved.resume!.snapshotId).not.toBe(old);
    expect(await t.prisma.resumeSnapshot.findMany({ select: { id: true } })).toEqual([
      { id: saved.resume!.snapshotId },
    ]);
  });

  it('candidatura antiga (sem cópia) ganha a de hoje; currículo vazio responde 400', async () => {
    const app = await apply();
    const empty = await api().post(`/api/applications/${app.id}/resume`).expect(400);
    expect(empty.body.message).toMatch(/currículo está vazio/);

    await fillResume();
    const saved = (await api().post(`/api/applications/${app.id}/resume`).expect(200))
      .body as ApplicationDetailDto;
    expect(saved.resume).toMatchObject({ sameAsCurrent: true });
  });

  it('apagar a candidatura apaga a cópia só se ninguém mais usa', async () => {
    await fillResume();
    const first = await apply();
    const second = await apply();

    await api().delete(`/api/applications/${first.id}`).expect(204);
    expect(await t.prisma.resumeSnapshot.count()).toBe(1);
    await api().delete(`/api/applications/${second.id}`).expect(204);
    expect(await t.prisma.resumeSnapshot.count()).toBe(0);
  });

  it('PDF enviado: anexa, baixa igual, troca e remove', async () => {
    const app = await apply();
    const content = pdf('a'.repeat(2 * 1024 * 1024)); // ~2 MB: passa do limite padrão de JSON

    const attached = (
      await api()
        .put(`/api/applications/${app.id}/resume-file`)
        .send({ name: 'Currículo ATS', contentBase64: content.toString('base64') })
        .expect(200)
    ).body as ApplicationDetailDto;
    expect(attached.resumeFile).toMatchObject({ name: 'Currículo ATS.pdf', size: content.length });

    const download = await api()
      .get(`/api/applications/${app.id}/resume-file`)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(download.headers['content-type']).toBe('application/pdf');
    expect(download.headers['content-disposition']).toContain(
      "filename*=UTF-8''Curr%C3%ADculo%20ATS.pdf",
    );
    expect(Buffer.compare(download.body as Buffer, content)).toBe(0);

    const replaced = (
      await api()
        .put(`/api/applications/${app.id}/resume-file`)
        .send({ name: 'v2.pdf', contentBase64: pdf('v2').toString('base64') })
        .expect(200)
    ).body as ApplicationDetailDto;
    expect(replaced.resumeFile).toMatchObject({ name: 'v2.pdf' });
    expect(await t.prisma.applicationFile.count()).toBe(1);

    const removed = (await api().delete(`/api/applications/${app.id}/resume-file`).expect(200))
      .body as ApplicationDetailDto;
    expect(removed.resumeFile).toBeNull();
    await api().get(`/api/applications/${app.id}/resume-file`).expect(404);
  });

  it('PDF: recusa o que não é PDF, base64 inválido e candidatura inexistente', async () => {
    const app = await apply();
    const notPdf = await api()
      .put(`/api/applications/${app.id}/resume-file`)
      .send({ name: 'foto.png', contentBase64: Buffer.from('PNG...').toString('base64') })
      .expect(400);
    expect(notPdf.body.message).toBe('Isso não parece um PDF.');

    await api()
      .put(`/api/applications/${app.id}/resume-file`)
      .send({ name: 'x.pdf', contentBase64: 'não é base64!' })
      .expect(400);

    await api()
      .put('/api/applications/nao-existe/resume-file')
      .send({ name: 'x.pdf', contentBase64: pdf().toString('base64') })
      .expect(404);
  });

  it('apagar a candidatura leva o PDF junto', async () => {
    const app = await apply();
    await api()
      .put(`/api/applications/${app.id}/resume-file`)
      .send({ name: 'cv.pdf', contentBase64: pdf().toString('base64') })
      .expect(200);
    await api().delete(`/api/applications/${app.id}`).expect(204);
    expect(await t.prisma.applicationFile.count()).toBe(0);
  });
});
