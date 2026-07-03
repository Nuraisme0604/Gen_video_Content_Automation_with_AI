import { Controller, Get, Patch, Post, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { VideoService } from './video.service';

@ApiTags('videos')
@Controller('videos')
export class VideoController {
  constructor(private svc: VideoService) {}

  @Get()
  @ApiQuery({ name: 'projectId', required: false })
  @ApiQuery({ name: 'batchId', required: false })
  list(@Query('projectId') projectId?: string, @Query('batchId') batchId?: string) {
    return this.svc.list(projectId, batchId);
  }

  @Get(':id') get(@Param('id') id: string) { return this.svc.get(id); }

  @Get(':id/preview-url') previewUrl(@Param('id') id: string) { return this.svc.getPreviewUrl(id); }

  @Get(':id/clips') clips(@Param('id') id: string) { return this.svc.getClips(id); }

  @Patch(':id') update(@Param('id') id: string, @Body() body: Record<string, any>) { return this.svc.update(id, body); }

  @Delete(':id') remove(@Param('id') id: string) { return this.svc.remove(id); }

  @Post(':id/scenes/:index/regenerate-image')
  regenerateSceneImage(@Param('id') id: string, @Param('index') index: string, @Body() body: { prompt?: string }) {
    return this.svc.regenerateSceneImage(id, parseInt(index, 10), body?.prompt);
  }

  @Post(':id/scenes/:index/regenerate-voice')
  regenerateSceneVoice(@Param('id') id: string, @Param('index') index: string) {
    return this.svc.regenerateSceneVoice(id, parseInt(index, 10));
  }

  @Post(':id/reassemble')
  reassemble(@Param('id') id: string) {
    return this.svc.reassemble(id);
  }
}
