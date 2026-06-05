import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HttpModule } from '@nestjs/axios';
import { SourceController } from './source.controller';
import { SourceService } from './source.service';
import { ApiKeyModule } from '../api-key/api-key.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'transcript-fetch' }),
    HttpModule,
    ApiKeyModule,
  ],
  controllers: [SourceController],
  providers: [SourceService],
})
export class SourceModule {}
