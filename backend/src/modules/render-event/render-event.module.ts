import { Module } from '@nestjs/common';
import { RenderEventController } from './render-event.controller';
import { RenderEventService } from './render-event.service';

@Module({
  controllers: [RenderEventController],
  providers: [RenderEventService],
  exports: [RenderEventService],
})
export class RenderEventModule {}
