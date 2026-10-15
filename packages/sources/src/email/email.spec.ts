import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { checkAvailability } from '../core/availability';
import type { HttpClient } from '../core/http';
import type { SourceContext } from '../core/job-source';
import { contentId, postedFromAge, salaryFromText, splitMode } from './alert-tools';
import { readAlert } from './alerts';
import { emailInactiveReason, parseEmailConfig } from './email.config';
import { EmailSource } from './email.source';
import { htmlTokens } from './html';
import { describeImapError, type MailboxReader } from './mailbox';
import { parseMessage, type MailMessage } from './message';

/**
 * Fixtures: alertas reais ANONIMIZADOS (nome, e-mail e links de rastreio
 * trocados por dados de exemplo). Os nomes de vaga e empresa são públicos.
 */
const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name));
const message = async (name: string) => parseMessage(fixture(name));

const alertOf = (outcome: ReturnType<typeof readAlert>) => {
  if (outcome.kind !== 'alert') throw new Error(`esperava alerta, veio ${outcome.reason}`);
  return outcome;
};

describe('LinkedIn', () => {
  it('"vagas semelhantes": 10 vagas, sem a vaga do cabeçalho', async () => {
    const alert = alertOf(readAlert(await message('linkedin-vagas-semelhantes.eml')));
    expect(alert.site).toBe('linkedin');
    expect(alert.jobs).toHaveLength(10);
    expect(alert.jobs[0]).toMatchObject({
      source: 'linkedin',
      externalId: '4472559058',
      url: 'https://www.linkedin.com/jobs/view/4472559058',
      title: 'Desenvolvedor(a) Fullstack Pl Node| React | React Native',
      company: 'Riachuelo',
      location: 'Brasil',
      workModel: 'remote',
      seniority: 'mid',
      description: null,
      postedAt: null,
    });
    expect(alert.jobs[0]!.stack).toEqual(expect.arrayContaining(['react', 'node.js']));
    // Empresa com "|" no nome e modalidade entre parênteses.
    expect(alert.jobs[5]).toMatchObject({
      company: 'Icomm Group | Shop2gether & OQVestir',
      workModel: 'remote',
    });
    // Sem modalidade no e-mail: nenhuma inventada.
    expect(alert.jobs[6]).toMatchObject({
      company: 'Capgemini',
      location: 'Barueri, SP',
      workModel: null,
    });
    // Mesmo título e empresa em cidades diferentes: duas vagas.
    expect(
      alert.jobs.filter((job) => job.company === 'SESATECH').map((job) => job.location),
    ).toEqual(['São Paulo, SP', 'Rio de Janeiro, RJ']);
    // A vaga do cabeçalho ("Vagas semelhantes à de...") é a que você já viu.
    expect(alert.jobs.map((job) => job.externalId)).not.toContain('4466008788');
  });

  it('sugestões: título com "(Remote)" e selo "Candidatura simplificada"', async () => {
    const alert = alertOf(readAlert(await message('linkedin-sugestoes.eml')));
    expect(alert.jobs.map((job) => [job.title, job.company, job.seniority])).toEqual([
      ['Desenvolvedor Júnior', 'wevy', 'junior'],
      ['Analista de Sistemas Júnior (Remoto)', 'Vitru Educação', 'junior'],
      ['Junior Software Engineer (Remote)', 'Hire Feed', 'junior'],
    ]);
  });

  it('sem HTML, lê o texto puro (mesmas vagas, local sem a modalidade)', async () => {
    const full = await message('linkedin-vagas-semelhantes.eml');
    const textOnly = alertOf(readAlert({ ...full, html: '' }));
    expect(textOnly.jobs.map((job) => job.externalId)).toEqual(
      alertOf(readAlert(full)).jobs.map((job) => job.externalId),
    );
    expect(textOnly.jobs[1]).toMatchObject({ company: 'ISA Saúde', location: 'São Paulo' });
  });

  it('notificação que não é vaga (conexão, post) é ignorada', async () => {
    const base = await message('linkedin-sugestoes.eml');
    const outcome = readAlert({
      ...base,
      from: 'notifications-noreply@linkedin.com',
      subject: 'Você tem 3 novas conexões',
      html: '<p>Maria aceitou seu convite.</p><a href="https://www.linkedin.com/comm/in/maria">Ver perfil</a>',
      text: 'Maria aceitou seu convite.',
    });
    expect(outcome).toEqual({ kind: 'ignored', reason: 'no-jobs', site: 'linkedin' });
  });
});

describe('Indeed', () => {
  it('alerta de empresa: 10 vagas com local, resumo e data aproximada', async () => {
    const mail = await message('indeed-empresa.eml');
    const alert = alertOf(readAlert(mail));
    expect(alert.site).toBe('indeed');
    expect(alert.jobs).toHaveLength(10);
    const [first, second] = alert.jobs;
    expect(first).toMatchObject({
      source: 'indeed',
      title: '[Tech] Desenvolvimento de Software Pleno | Protheus (híbrido)',
      company: 'TOTVS',
      location: 'São Paulo, SP',
      workModel: 'hybrid',
      seniority: 'mid',
    });
    expect(first!.url).toMatch(/^https:\/\/engage\.indeed\.com\/f\/a\//);
    expect(first!.description).toMatch(/^1 dia off por ano/);
    // "há 5 dias" antes do envio do e-mail.
    expect(new Date(first!.postedAt!).getTime()).toBe(mail.date!.getTime() - 5 * 86_400_000);
    // "Remoto" é a modalidade, não um lugar.
    expect(second).toMatchObject({ location: null, workModel: 'remote' });
  });

  it('o id é a vaga, não o link (o link de rastreio muda a cada e-mail)', async () => {
    const alert = alertOf(readAlert(await message('indeed-empresa.eml')));
    const first = alert.jobs[0]!;
    expect(first.externalId).toBe(contentId('TOTVS', first.title, 'São Paulo, SP'));
    expect(new Set(alert.jobs.map((job) => job.externalId)).size).toBe(10);
  });
});

describe('Glassdoor', () => {
  it('13 vagas, nota da empresa ignorada, salário estimado e "Trabalho remoto" (modalidade, não lugar)', async () => {
    const mail = await message('glassdoor-alerta.eml');
    const alert = alertOf(readAlert(mail));
    expect(alert.site).toBe('glassdoor');
    expect(alert.jobs).toHaveLength(13);
    expect(alert.jobs[0]).toMatchObject({
      source: 'glassdoor',
      externalId: '1010291473383',
      url: 'https://www.glassdoor.com.br/job-listing/j?jl=1010291473383',
      title: 'Analista de Suporte N2',
      company: 'Gaudium',
      location: null,
      workModel: 'remote',
      salary: { min: 4000, max: 4000, currency: 'BRL', period: 'month' },
    });
    expect(new Date(alert.jobs[0]!.postedAt!).getTime()).toBe(
      mail.date!.getTime() - 4 * 86_400_000,
    );
    // Empresa sem nota e vaga com o selo "Candidatura rápida".
    expect(alert.jobs.at(-1)).toMatchObject({
      title: '[Job - 32040] Analista de Suporte Pleno (Developer L3)',
      company: 'CI&T',
      salary: null,
    });
  });
});

describe('nunca acessa os sites', () => {
  it('"a vaga ainda está aberta?" não faz requisição para LinkedIn, Indeed e Glassdoor', async () => {
    const http = { getJson: vi.fn(), getText: vi.fn() } as unknown as HttpClient;
    for (const name of [
      'linkedin-vagas-semelhantes.eml',
      'indeed-empresa.eml',
      'glassdoor-alerta.eml',
    ]) {
      for (const job of alertOf(readAlert(await message(name))).jobs) {
        const result = await checkAvailability(
          { source: job.source, url: job.url, externalId: job.externalId, board: null },
          http,
        );
        expect(result.state).toBe('unknown');
      }
    }
    expect(http.getJson).not.toHaveBeenCalled();
    expect(http.getText).not.toHaveBeenCalled();
  });
});

describe('remetente', () => {
  it('outro remetente: ignorado', async () => {
    const base = await message('linkedin-sugestoes.eml');
    expect(readAlert({ ...base, from: 'promo@loja.com.br' })).toEqual({
      kind: 'ignored',
      reason: 'unknown-sender',
    });
  });

  it('"From: LinkedIn" sem a assinatura do LinkedIn (provedor não confirmou): ignorado', async () => {
    const base = await message('linkedin-sugestoes.eml');
    const spoofed: MailMessage = {
      ...base,
      authResults: 'mx.google.com; dkim=pass header.i=@golpe.example; spf=fail; dmarc=fail',
    };
    expect(readAlert(spoofed)).toEqual({
      kind: 'ignored',
      reason: 'not-authentic',
      site: 'linkedin',
    });
    // Provedor que não escreve o cabeçalho: não dá para saber, aceita.
    expect(readAlert({ ...base, authResults: null }).kind).toBe('alert');
  });

  it('só o Authentication-Results de cima conta (o de baixo pode vir do remetente)', async () => {
    const raw = fixture('linkedin-sugestoes.eml')
      .toString('utf8')
      .replace(
        /^Authentication-Results: [^\r\n]+/m,
        'Authentication-Results: mx.google.com; dkim=fail header.i=@golpe.example\r\nAuthentication-Results: dkim=pass header.i=@linkedin.com',
      );
    expect(readAlert(await parseMessage(raw))).toMatchObject({ reason: 'not-authentic' });
  });
});

describe('ferramentas', () => {
  it('htmlTokens: texto na ordem, com o link em volta e sem caracteres invisíveis', () => {
    expect(
      htmlTokens(
        '<!DOCTYPE html><style>p{}</style><p>A&nbsp;​vaga</p><a href="https://x.com/?a=1&amp;b=2"><b>Título</b> aqui</a><!-- oculto -->fim',
      ),
    ).toEqual([
      { text: 'A vaga', href: null },
      { text: 'Título', href: 'https://x.com/?a=1&b=2' },
      { text: 'aqui', href: 'https://x.com/?a=1&b=2' },
      { text: 'fim', href: null },
    ]);
  });

  it('salaryFromText', () => {
    expect(salaryFromText('R$ 4 mil')).toEqual({
      min: 4000,
      max: 4000,
      currency: 'BRL',
      period: 'month',
    });
    expect(salaryFromText('R$ 3 mil - R$ 5 mil')).toMatchObject({ min: 3000, max: 5000 });
    expect(salaryFromText('R$ 2.500,50 - R$ 3.000 por mês')).toMatchObject({
      min: 2501,
      max: 3000,
    });
    expect(salaryFromText('R$ 60 mil por ano')).toMatchObject({ min: 60000, period: 'year' });
    expect(salaryFromText('R$ 25 por hora')).toMatchObject({ min: 25, period: 'hour' });
    expect(salaryFromText('a combinar')).toBeNull();
  });

  it('splitMode e postedFromAge', () => {
    expect(splitMode('São Paulo, SP (Híbrido)')).toEqual({
      place: 'São Paulo, SP',
      mode: 'Híbrido',
    });
    expect(splitMode('Barueri, SP')).toEqual({ place: 'Barueri, SP', mode: null });
    expect(splitMode('Remoto')).toEqual({ place: '', mode: 'Remoto' });
    expect(splitMode('Trabalho remoto')).toEqual({ place: '', mode: 'Trabalho remoto' });
    expect(splitMode('Remoto em São Paulo, SP')).toMatchObject({
      place: 'Remoto em São Paulo, SP',
    });
    const sent = new Date('2026-10-14T12:00:00Z');
    expect(postedFromAge('há 5 dias', sent)?.toISOString()).toBe('2026-10-09T12:00:00.000Z');
    expect(postedFromAge('4 dia(s)', sent)?.toISOString()).toBe('2026-10-10T12:00:00.000Z');
    expect(postedFromAge('30d+', sent)?.toISOString()).toBe('2026-09-14T12:00:00.000Z');
    expect(postedFromAge('24h', sent)?.toISOString()).toBe('2026-10-13T12:00:00.000Z');
    expect(postedFromAge('Hoje', sent)).toBe(sent);
    expect(postedFromAge('Trabalho remoto', sent)).toBeUndefined();
  });
});

describe('configuração', () => {
  it('padrões: Gmail, marcador BuscaVagas, 3 dias, a cada 60 min; sem senha fica inativa', () => {
    const config = parseEmailConfig({});
    expect(config).toEqual({
      host: 'imap.gmail.com',
      port: 993,
      user: null,
      password: null,
      folder: 'BuscaVagas',
      lookbackDays: 3,
      intervalMinutes: 60,
      maxAgeDays: 30,
    });
    expect(emailInactiveReason(config)).toMatch(/EMAIL_USER e EMAIL_PASSWORD/);
  });

  it('senha de app do Gmail com espaços; outro provedor fica como veio', () => {
    expect(
      parseEmailConfig({ EMAIL_USER: 'ana@gmail.com', EMAIL_PASSWORD: 'abcd efgh ijkl mnop' })
        .password,
    ).toBe('abcdefghijklmnop');
    expect(
      parseEmailConfig({ EMAIL_IMAP_HOST: 'imap.outro.com', EMAIL_PASSWORD: 'a b' }).password,
    ).toBe('a b');
    expect(
      emailInactiveReason(parseEmailConfig({ EMAIL_USER: 'a', EMAIL_PASSWORD: 'b' })),
    ).toBeNull();
  });

  it('intervalo: 0 (só pelo botão) ou de 15 a 1440 minutos', () => {
    expect(parseEmailConfig({ EMAIL_INTERVAL_MINUTES: '0' }).intervalMinutes).toBe(0);
    expect(() => parseEmailConfig({ EMAIL_INTERVAL_MINUTES: '5' })).toThrow(
      /EMAIL_INTERVAL_MINUTES/,
    );
  });

  it('erro do IMAP vira instrução, sem a senha', () => {
    const config = parseEmailConfig({ EMAIL_USER: 'ana@gmail.com', EMAIL_PASSWORD: 'segredo123' });
    const login = describeImapError({ authenticationFailed: true }, config);
    expect(login).toMatch(/recusou o login de ana@gmail.com.*senha de app/);
    expect(login).not.toContain('segredo123');
    for (const error of [
      { serverResponseCode: 'NONEXISTENT' },
      { responseText: 'Unknown Mailbox: BuscaVagas (now in authenticated state) (Failure)' },
      { message: 'Invalid mailbox name' },
    ]) {
      expect(describeImapError(error, config)).toMatch(/Não achei o marcador "BuscaVagas"/);
    }
  });
});

describe('EmailSource', () => {
  const ctx = (): SourceContext & { lines: string[] } => {
    const lines: string[] = [];
    return {
      http: {} as SourceContext['http'],
      signal: new AbortController().signal,
      log: (line) => lines.push(line),
      lines,
    };
  };
  const env = { EMAIL_USER: 'ana@example.com', EMAIL_PASSWORD: 'x' };
  const config = parseEmailConfig(env);
  const now = () => new Date('2026-10-15T12:00:00Z');

  it('lê a janela, baixa cada e-mail uma vez e devolve as vagas de todos', async () => {
    const mails: Record<string, Buffer> = {
      '7:1': fixture('linkedin-vagas-semelhantes.eml'),
      '7:2': fixture('indeed-empresa.eml'),
      '7:3': fixture('glassdoor-alerta.eml'),
      '7:4': Buffer.from('From: promo@loja.com.br\r\nSubject: oferta\r\n\r\noi'),
    };
    let window = Object.keys(mails);
    const reader = vi.fn<MailboxReader>(async (_config, query) => ({
      keys: window,
      fresh: window
        .filter((key) => !query.known.has(key))
        .map((key) => ({ key, source: mails[key]! })),
    }));
    const source = new EmailSource(config, reader, now);
    expect(source.scheduleEveryMs).toBe(60 * 60_000);

    const first = ctx();
    const result = await source.fetch({}, first);
    expect(result.jobs).toHaveLength(10 + 10 + 13);
    expect(reader.mock.calls[0]![1].since.toISOString()).toBe('2026-10-12T12:00:00.000Z');
    expect(first.lines[0]).toBe(
      'email: 4 e-mails em "BuscaVagas" (4 novos) · alertas: linkedin 1, indeed 1, glassdoor 1 · ignorados: 1 de outro remetente',
    );

    // Segunda vez: nada novo para baixar, mesmas vagas (o "visto por último" atualiza).
    const second = ctx();
    expect((await source.fetch({}, second)).jobs).toHaveLength(33);
    expect(reader.mock.calls[1]![1].known.size).toBe(4);
    expect(second.lines[0]).toContain('(0 novos)');

    // O e-mail do LinkedIn saiu da janela: as vagas dele também.
    window = ['7:2', '7:3', '7:4'];
    expect((await source.fetch({}, ctx())).jobs).toHaveLength(23);
  });

  it('vaga publicada há mais de EMAIL_MAX_AGE_DAYS (30) fica de fora; sem data, fica', async () => {
    const reader: MailboxReader = async () => ({
      keys: ['1:1', '1:2'],
      fresh: [
        { key: '1:1', source: fixture('glassdoor-alerta.eml') },
        { key: '1:2', source: fixture('linkedin-sugestoes.eml') },
      ],
    });
    // Dois meses depois do alerta: as vagas do Glassdoor ("N dia(s)") passaram
    // dos 30 dias; as do LinkedIn não dizem a idade.
    const later = () => new Date('2026-12-15T12:00:00Z');
    const log = ctx();
    const result = await new EmailSource(config, reader, later).fetch({}, log);
    expect(result.jobs.map((job) => job.source)).toEqual(['linkedin', 'linkedin', 'linkedin']);
    expect(result.filtered).toBe(13);
    expect(log.lines[0]).toContain('13 vagas com mais de 30 dias deixadas de fora');

    const noLimit = parseEmailConfig({ ...env, EMAIL_MAX_AGE_DAYS: '0' });
    expect((await new EmailSource(noLimit, reader, later).fetch({}, ctx())).jobs).toHaveLength(16);
  });

  it('a mesma vaga em dois alertas entra uma vez', async () => {
    const mail = fixture('linkedin-sugestoes.eml');
    const reader: MailboxReader = async () => ({
      keys: ['1:1', '1:2'],
      fresh: [
        { key: '1:1', source: mail },
        { key: '1:2', source: mail },
      ],
    });
    expect((await new EmailSource(config, reader, now).fetch({}, ctx())).jobs).toHaveLength(3);
  });

  it('erro do IMAP derruba a busca com a mensagem do leitor', async () => {
    const reader: MailboxReader = async () => {
      throw new Error('Não achei o marcador "BuscaVagas" no e-mail.');
    };
    await expect(new EmailSource(config, reader, now).fetch({}, ctx())).rejects.toThrow(
      /Não achei o marcador/,
    );
  });
});
