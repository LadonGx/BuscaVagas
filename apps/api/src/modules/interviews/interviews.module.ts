import { Module } from '@nestjs/common';
import { InterviewsController } from './interviews.controller';
import { InterviewsSeeder } from './interviews.seeder';
import { InterviewsService } from './interviews.service';

/**
 * Banco de perguntas de entrevista, com as candidaturas onde cada uma caiu e
 * o modo treino. Plano: docs/features/15-interview-questions.md
 */
@Module({
  controllers: [InterviewsController],
  providers: [InterviewsService, InterviewsSeeder],
})
export class InterviewsModule {}
