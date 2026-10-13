import {
  isAnswered,
  type AskedInput,
  type CreateInterviewQuestionInput,
  type InterviewQuestionDto,
  type PracticeInput,
  type PracticeRating,
  type UpdateInterviewQuestionInput,
} from '@busca-vagas/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { InterviewSeed } from './interview-seeds';

const SEED_FLAG = 'interview-seeds';

const questionInclude = {
  asked: {
    orderBy: [{ askedAt: 'desc' }, { id: 'desc' }],
    include: { application: { select: { job: { select: { title: true, company: true } } } } },
  },
} satisfies Prisma.InterviewQuestionInclude;

type QuestionRow = Prisma.InterviewQuestionGetPayload<{ include: typeof questionInclude }>;

export function toInterviewQuestionDto(row: QuestionRow): InterviewQuestionDto {
  return {
    id: row.id,
    question: row.question,
    category: row.category,
    tags: row.tags,
    answer: row.answer,
    starSituation: row.starSituation,
    starTask: row.starTask,
    starAction: row.starAction,
    starResult: row.starResult,
    answered: isAnswered(row),
    practice: {
      count: row.practiceCount,
      lastRating:
        row.lastRating === 'good' || row.lastRating === 'again'
          ? (row.lastRating as PracticeRating)
          : null,
      practicedAt: row.practicedAt?.toISOString() ?? null,
    },
    asked: row.asked.map((item) => ({
      applicationId: item.applicationId,
      jobTitle: item.application.job.title,
      company: item.application.job.company,
      askedAt: item.askedAt.toISOString(),
      note: item.note,
    })),
    seeded: row.seeded,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const notFound = () =>
  new NotFoundException({ statusCode: 404, message: 'Pergunta não encontrada.' });

/**
 * Banco de perguntas de entrevista: suas respostas, onde cada pergunta caiu
 * e o treino. Plano: docs/features/15-interview-questions.md
 */
@Injectable()
export class InterviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Todas (são dezenas, não milhares): a tela filtra e busca na hora. */
  async list(): Promise<InterviewQuestionDto[]> {
    const rows = await this.prisma.interviewQuestion.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: questionInclude,
    });
    return rows.map(toInterviewQuestionDto);
  }

  async get(id: string): Promise<InterviewQuestionDto> {
    const row = await this.prisma.interviewQuestion.findUnique({
      where: { id },
      include: questionInclude,
    });
    if (!row) throw notFound();
    return toInterviewQuestionDto(row);
  }

  async create(input: CreateInterviewQuestionInput): Promise<InterviewQuestionDto> {
    const { askedIn, ...data } = input;
    if (askedIn) await this.assertApplication(askedIn);
    const row = await this.prisma.interviewQuestion.create({
      data: {
        ...data,
        tags: data.tags ?? [],
        ...(askedIn && { asked: { create: { applicationId: askedIn } } }),
      },
      select: { id: true },
    });
    return this.get(row.id);
  }

  async update(id: string, input: UpdateInterviewQuestionInput): Promise<InterviewQuestionDto> {
    await this.assertQuestion(id);
    await this.prisma.interviewQuestion.update({ where: { id }, data: input });
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    await this.assertQuestion(id);
    await this.prisma.interviewQuestion.delete({ where: { id } });
  }

  /** Treino: "fui bem" / "preciso treinar". */
  async practice(
    id: string,
    input: PracticeInput,
    now = new Date(),
  ): Promise<InterviewQuestionDto> {
    await this.assertQuestion(id);
    await this.prisma.interviewQuestion.update({
      where: { id },
      data: { practiceCount: { increment: 1 }, lastRating: input.rating, practicedAt: now },
    });
    return this.get(id);
  }

  /** "Caiu nesta entrevista" (de novo = atualiza a anotação). */
  async markAsked(
    id: string,
    applicationId: string,
    input: AskedInput,
  ): Promise<InterviewQuestionDto> {
    await this.assertQuestion(id);
    await this.assertApplication(applicationId);
    await this.prisma.interviewAsked.upsert({
      where: { questionId_applicationId: { questionId: id, applicationId } },
      create: { questionId: id, applicationId, note: input.note ?? null },
      update: input.note === undefined ? {} : { note: input.note },
    });
    return this.get(id);
  }

  async unmarkAsked(id: string, applicationId: string): Promise<InterviewQuestionDto> {
    await this.assertQuestion(id);
    await this.prisma.interviewAsked.deleteMany({ where: { questionId: id, applicationId } });
    return this.get(id);
  }

  /** Lista inicial, uma vez só: apagar as perguntas não as traz de volta. */
  async seedOnce(seeds: readonly InterviewSeed[]): Promise<number | null> {
    return this.prisma.$transaction(async (tx) => {
      if (await tx.systemFlag.findUnique({ where: { key: SEED_FLAG } })) return null;
      // Criadas em ordem, com um milissegundo de diferença: a lista fica na ordem do arquivo.
      const start = Date.now() - seeds.length;
      const { count } = await tx.interviewQuestion.createMany({
        data: seeds.map((seed, index) => ({
          question: seed.question,
          category: seed.category,
          tags: seed.tags ?? [],
          seeded: true,
          createdAt: new Date(start + index),
        })),
      });
      await tx.systemFlag.create({ data: { key: SEED_FLAG } });
      return count;
    });
  }

  private async assertQuestion(id: string): Promise<void> {
    const found = await this.prisma.interviewQuestion.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!found) throw notFound();
  }

  private async assertApplication(id: string): Promise<void> {
    const found = await this.prisma.application.findUnique({ where: { id }, select: { id: true } });
    if (!found) {
      throw new NotFoundException({ statusCode: 404, message: 'Candidatura não encontrada.' });
    }
  }
}
