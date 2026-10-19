import { isRestrictedUrl, siteJobUrl, type JobDto } from '@busca-vagas/shared';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { AppClient, findApp, webOrigin } from './app-client.js';
import { BrowserError, openBrowser, PROFILE_DIR } from './browser.js';
import { describeEvent, Filler } from './filler.js';
import { buildProfile } from './profile.js';
import { makeResumePdf, type ResumePdf } from './resume-pdf.js';

/**
 * `pnpm candidatar [id da vaga | link]` (docs/features/22-apply-fill.md).
 *
 * Abre a vaga numa janela do Chrome/Edge, preenche os campos com o seu
 * currículo e as respostas salvas e para. Quem confere e envia é você. Ao
 * fechar a janela, pergunta se você enviou, para registrar a candidatura.
 */

const say = (text = '') => console.log(text);
const isGupy = (url: string) => /(^|\.)gupy\.io$/i.test(new URL(url).hostname);

function siteName(url: string): string {
  if (isGupy(url)) return 'Gupy';
  return new URL(url).hostname.replace(/^www\./, '');
}

async function ask(question: string): Promise<string> {
  if (!process.stdin.isTTY) return '';
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/** Sem argumento: escolhe entre as vagas salvas. */
async function pickSaved(app: AppClient): Promise<JobDto | null> {
  const jobs = (await app.savedJobs()).filter(
    (job) => job.url && !job.application && !isRestrictedUrl(job.url),
  );
  if (jobs.length === 0) {
    say('Nenhuma vaga salva para preencher (as dos sites restritos ficam de fora).');
    say('Use: pnpm candidatar <id da vaga ou link>');
    return null;
  }
  say('Vagas salvas:');
  jobs.slice(0, 20).forEach((job, index) => {
    say(
      `  ${String(index + 1).padStart(2)}. ${job.title} · ${job.company} (${siteName(job.url!)})`,
    );
  });
  const answer = Number(await ask('\nNúmero da vaga (Enter para sair): '));
  return Number.isInteger(answer) && answer >= 1 && answer <= jobs.length
    ? jobs[answer - 1]!
    : null;
}

async function main(): Promise<number> {
  const arg = process.argv[2]?.trim();
  const base = await findApp(fetch, process.env.BUSCAVAGAS_URL);
  if (!base) {
    say('Não achei o BuscaVagas em 127.0.0.1:8080 nem em 127.0.0.1:3333.');
    say('Suba o app (pnpm app:up, ou pnpm dev:api e pnpm dev:web) e rode de novo.');
    return 1;
  }
  const app = new AppClient(base);
  const web = webOrigin(base);

  let job: JobDto | null;
  let url: string | null = null;
  if (!arg) {
    job = await pickSaved(app);
    if (!job) return 0;
  } else if (/^https?:\/\//i.test(arg)) {
    url = siteJobUrl(arg);
    job = (await app.lookup(url)).job;
  } else {
    job = await app.job(arg);
    if (!job) {
      say(`Não achei a vaga "${arg}" no app.`);
      return 1;
    }
  }
  url = job?.url ?? url;
  if (!url) {
    say('Essa vaga não tem link: não há formulário para abrir.');
    return 1;
  }
  if (isRestrictedUrl(url)) {
    say(
      `${siteName(url)} proíbe automação nos termos de uso: aqui o BuscaVagas não preenche nada.`,
    );
    say('Abra a vaga pelo app e use a tela Currículo para copiar e colar.');
    return 1;
  }

  say(job ? `Vaga: ${job.title} · ${job.company}` : `Vaga: ${url} (não está no app)`);
  if (job?.application) say('Atenção: você já registrou candidatura nessa vaga.');

  const profile = buildProfile((await app.resume()).sections);
  if (Object.keys(profile.values).length === 0 && profile.answers.length === 0) {
    say('Seu currículo no app está vazio: preencha a tela Currículo para ter o que usar.');
  }

  const dir = await mkdtemp(join(tmpdir(), 'buscavagas-'));
  try {
    let pdf: ResumePdf | null = null;
    try {
      pdf = await makeResumePdf(web, dir);
      say(pdf ? `Currículo em PDF pronto: ${pdf.name}` : 'Sem PDF: o currículo está vazio.');
    } catch (error) {
      say(
        `Sem PDF do currículo (${error instanceof Error ? error.message.split('\n')[0] : error}).`,
      );
      say(`A tela do app precisa abrir em ${web}/curriculo/imprimir.`);
    }

    const context = await openBrowser();
    let closed = false;
    context.on('close', () => {
      closed = true;
    });
    process.once('SIGINT', () => void context.close());

    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => undefined);

    say('');
    say('A janela abriu. Vá até o formulário: os campos vazios são preenchidos conforme aparecem.');
    say('Nada é enviado: confira tudo e clique em enviar você mesmo. Feche a janela ao terminar.');
    if (isGupy(url)) {
      say('Na Gupy: clique em "Candidatar-se" e entre com a sua conta (o login fica salvo neste');
      say('navegador). A Gupy já guarda seus dados; aqui entram as perguntas e o currículo.');
    }
    say(`(Perfil do navegador: ${PROFILE_DIR})`);
    say('');

    const seen = new Set<string>();
    const filler = new Filler(profile, pdf?.path ?? null, (event) => {
      const line = describeEvent(event);
      if (!seen.has(line)) {
        seen.add(line);
        say(line);
      }
    });
    while (!closed) {
      for (const open of context.pages()) await filler.fillPage(open);
      await sleep(1_500);
    }

    say('');
    say(
      `Janela fechada. ${filler.filled} ${filler.filled === 1 ? 'campo preenchido' : 'campos preenchidos'}.`,
    );
    if (!job || job.application) return 0;
    if (!process.stdin.isTTY) {
      say('Se você enviou, registre com "Me candidatei" na vaga, no app.');
      return 0;
    }

    const sent = await ask('Você enviou a candidatura? (s/N) ');
    if (!/^s(im)?$/i.test(sent)) {
      say('Ok, nada registrado. A vaga continua no app.');
      return 0;
    }
    const application = await app.createApplication(job.id, siteName(url));
    if (pdf && filler.resumeAttached) {
      await app.attachResumeFile(application.id, pdf.name, pdf.content);
    }
    say(`Candidatura registrada: ${web}/candidaturas/${application.id}`);
    return 0;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    say(
      error instanceof BrowserError
        ? error.message
        : `Erro: ${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
  },
);
