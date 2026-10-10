import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { validateEnv } from './config/env';
import { HealthModule } from './health/health.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { DiscoveryModule } from './modules/discovery/discovery.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { PreferencesModule } from './modules/preferences/preferences.module';
import { ResumeModule } from './modules/resume/resume.module';
import { ScoringModule } from './modules/scoring/scoring.module';
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
    ScoringModule,
    HealthModule,
    JobsModule,
    ApplicationsModule,
    ResumeModule,
    DiscoveryModule,
    PreferencesModule,
    MaintenanceModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
