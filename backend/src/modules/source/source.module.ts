import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HttpModule } from '@nestjs/axios';
import { SourceController } from './source.controller';
import { SourceService } from './source.service';
import { BatchRenderProcessor } from './batch-render.processor';
import { ApiKeyModule } from '../api-key/api-key.module';
import { GatewaysModule } from '../../gateways/gateways.module';
import { RenderEventModule } from '../render-event/render-event.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'transcript-fetch' }),
    BullModule.registerQueue({ name: 'batch-render' }),
    HttpModule,
    ApiKeyModule,
    GatewaysModule,
    RenderEventModule,
  ],
  controllers: [SourceController],
  providers: [SourceService, BatchRenderProcessor],
})
export class SourceModule {}
