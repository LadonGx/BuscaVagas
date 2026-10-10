import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { validateEnv } from './config/env';
import { HealthModule } from './health/health.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { DiscoveryModule } from './modules/discovery/discovery.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { ResumeModule } from './modules/resume/resume.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Rodando de apps/api: o .env local tem prioridade sobre o da raiz.
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    PrismaModule,
    QueueModule,
    HealthModule,
    JobsModule,
    ApplicationsModule,
    ResumeModule,
    DiscoveryModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
