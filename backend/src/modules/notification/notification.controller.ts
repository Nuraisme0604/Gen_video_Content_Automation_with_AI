import { Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { NotificationService } from './notification.service';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationController {
  constructor(private svc: NotificationService) {}

  @Get()
  @ApiQuery({ name: 'projectId', required: false })
  list(@Query('projectId') projectId?: string) {
    return this.svc.list(projectId);
  }

  @Post('test-telegram')
  testTelegram() { return this.svc.testConnection(); }
}
