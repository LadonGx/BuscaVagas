import {
  notificationSettingsInputSchema,
  type NotificationSettingsDto,
  type NotificationSettingsInput,
  type NotificationsDto,
} from '@busca-vagas/shared';
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { NotificationsService } from './notifications.service';

/** Plano: docs/features/16-notifications.md */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(): Promise<NotificationsDto> {
    return this.notifications.list();
  }

  /** Marca todos como lidos (abriu o sino). */
  @Post('read')
  @HttpCode(HttpStatus.OK)
  markAllRead(): Promise<NotificationsDto> {
    return this.notifications.markAllRead();
  }

  @Get('settings')
  settings(): Promise<NotificationSettingsDto> {
    return this.notifications.settings();
  }

  @Put('settings')
  saveSettings(
    @Body(new ZodValidationPipe(notificationSettingsInputSchema)) body: NotificationSettingsInput,
  ): Promise<NotificationSettingsDto> {
    return this.notifications.saveSettings(body);
  }
}
