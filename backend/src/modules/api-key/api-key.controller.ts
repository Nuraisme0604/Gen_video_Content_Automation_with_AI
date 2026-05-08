import { Controller, Get, Post, Delete, Patch, Param, Body, Query, Headers, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { ApiKeyService } from './api-key.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@ApiTags('api-keys')
@Controller('api-keys')
export class ApiKeyController {
  constructor(private svc: ApiKeyService, private config: ConfigService) {}

  /**
   * Internal endpoint: returns a DECRYPTED active key for a capability.
   * Used by n8n + worker so they can rotate through DB-stored keys instead of
   * relying on a single static $env.OPENAI_API_KEY that hits quota walls.
   * Protected by shared secret header — only allow internal containers.
   */
  @Get('internal/active')
  @ApiQuery({ name: 'capability', required: true })
  @ApiQuery({ name: 'provider', required: false })
  async pickActive(
    @Query('capability') capability: string,
    @Query('provider') provider: string | undefined,
    @Headers('x-internal-secret') secret: string,
  ) {
    const expected = this.config.get('INTERNAL_API_SECRET') || 'dev-internal-secret';
    if (secret !== expected) {
      throw new ForbiddenException('Invalid internal secret');
    }
    const result = await this.svc.pickActive(capability, provider);
    if (!result) {
      throw new NotFoundException(`No active key for capability=${capability}${provider ? ` provider=${provider}` : ''}`);
    }
    return result;
  }

  @Get()
  @ApiQuery({ name: 'projectId', required: false })
  list(@Query('projectId') projectId?: string) {
    return this.svc.list(projectId);
  }

  @Post()
  create(@Body() dto: CreateApiKeyDto) { return this.svc.create(dto); }

  @Post('test')
  test(@Body() body: { key: string; provider: string }) {
    return this.svc.testKey(body.key, body.provider);
  }

  @Patch(':id/toggle')
  toggle(@Param('id') id: string) { return this.svc.toggleActive(id); }

  @Patch(':id/reset-quota')
  resetQuota(@Param('id') id: string) { return this.svc.resetQuota(id); }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.svc.remove(id); }
}
