import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HttpModule } from '@nestjs/axios';
import { SourceController } from './source.controller';
import { SourceService } from './source.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'transcript-fetch' }),
    HttpModule,
  ],
  controllers: [SourceController],
  providers: [SourceService],
})
export class SourceModule {}
