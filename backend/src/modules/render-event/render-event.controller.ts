import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RenderEventService } from './render-event.service';

@ApiTags('render-events')
@Controller('videos/:videoId/render-events')
export class RenderEventController {
  constructor(private svc: RenderEventService) {}

  @Get()
  list(@Param('videoId') videoId: string) {
    return this.svc.list(videoId);
  }
}
