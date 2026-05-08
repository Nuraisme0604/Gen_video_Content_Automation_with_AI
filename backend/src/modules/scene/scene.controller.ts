import { Controller, Get, Patch, Post, Param, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SceneService } from './scene.service';

@ApiTags('scenes')
@Controller()
export class SceneController {
  constructor(private svc: SceneService) {}

  @Get('videos/:videoId/scenes')
  listByVideo(@Param('videoId') videoId: string) {
    return this.svc.listByVideo(videoId);
  }

  @Get('scenes/:id') get(@Param('id') id: string) { return this.svc.get(id); }

  @Post('scenes/:id/regenerate')
  regenerate(@Param('id') id: string) { return this.svc.regenerate(id); }

  @Patch('scenes/:id')
  update(@Param('id') id: string, @Body() body: Record<string, any>) { return this.svc.update(id, body); }
}
