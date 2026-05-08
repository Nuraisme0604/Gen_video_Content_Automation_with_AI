import { Controller, Get, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { VideoService } from './video.service';

@ApiTags('videos')
@Controller('videos')
export class VideoController {
  constructor(private svc: VideoService) {}

  @Get()
  @ApiQuery({ name: 'projectId', required: false })
  list(@Query('projectId') projectId?: string) {
    return this.svc.list(projectId);
  }

  @Get(':id') get(@Param('id') id: string) { return this.svc.get(id); }

  @Get(':id/preview-url') previewUrl(@Param('id') id: string) { return this.svc.getPreviewUrl(id); }

  @Patch(':id') update(@Param('id') id: string, @Body() body: Record<string, any>) { return this.svc.update(id, body); }

  @Delete(':id') remove(@Param('id') id: string) { return this.svc.remove(id); }
}
