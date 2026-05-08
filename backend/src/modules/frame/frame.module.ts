import { Module } from '@nestjs/common';
import { FrameController } from './frame.controller';
import { FrameService } from './frame.service';

@Module({
  controllers: [FrameController],
  providers: [FrameService],
  exports: [FrameService],
})
export class FrameModule {}
