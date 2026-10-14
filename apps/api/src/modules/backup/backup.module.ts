import { Module } from '@nestjs/common';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';

/** Backup (.zip), restauração e CSV das candidaturas. Plano: docs/features/18-backup.md */
@Module({
  controllers: [BackupController],
  providers: [BackupService],
})
export class BackupModule {}
