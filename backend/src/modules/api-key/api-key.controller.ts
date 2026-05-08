import { Controller, Get, Post, Delete, Patch, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { ApiKeyService } from './api-key.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@ApiTags('api-keys')
@Controller('api-keys')
export class ApiKeyController {
  constructor(private svc: ApiKeyService) {}

  @Get()
  @ApiQuery({ name: 'projectId', required: false })
  list(@Query('projectId') projectId?: string) {
    return this.svc.list(projectId);
  }

  @Post()
  create(@Body() dto: CreateApiKeyDto) { return this.svc.create(dto); }

  @Patch(':id/toggle')
  toggle(@Param('id') id: string) { return this.svc.toggleActive(id); }

  @Patch(':id/reset-quota')
  resetQuota(@Param('id') id: string) { return this.svc.resetQuota(id); }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.svc.remove(id); }
}
