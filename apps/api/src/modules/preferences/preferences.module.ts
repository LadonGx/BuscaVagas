import { Module } from '@nestjs/common';
import { PreferencesController } from './preferences.controller';
import { PreferencesService } from './preferences.service';

/**
 * Preferências de busca (linha única). Mudá-las pede o recálculo das notas
 * à fila `scoring` — ver modules/scoring.
 *
 * Plano: docs/features/07-preferences-score.md
 */
@Module({
  controllers: [PreferencesController],
  providers: [PreferencesService],
})
export class PreferencesModule {}
