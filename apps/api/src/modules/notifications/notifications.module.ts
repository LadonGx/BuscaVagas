import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * Avisos no sino do app (vaga nova com nota alta). Global: a fila de notas
 * chama `collect()` depois de cada rodada.
 * Plano: docs/features/16-notifications.md
 */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
