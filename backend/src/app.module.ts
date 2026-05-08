import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { HttpModule } from '@nestjs/axios';
import { VideoModule } from './modules/video/video.module';
import { SceneModule } from './modules/scene/scene.module';
import { SourceModule } from './modules/source/source.module';
import { JobModule } from './modules/job/job.module';
import { NotificationModule } from './modules/notification/notification.module';
import { PrismaModule } from './prisma/prisma.module';
import { JobsGateway } from './gateways/jobs.gateway';
import { N8nWebhookController } from './webhooks/n8n.controller';
import { WorkerWebhookController } from './webhooks/worker.controller';
import { ProjectModule } from './modules/project/project.module';
import { ApiKeyModule } from './modules/api-key/api-key.module';
import { CharacterModule } from './modules/character/character.module';
import { FrameModule } from './modules/frame/frame.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    HttpModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get('REDIS_URL', 'redis://localhost:6379'),
        },
      }),
    }),
    BullModule.registerQueue({ name: 'render' }),
    BullModule.registerQueue({ name: 'notify' }),
    PrismaModule,
    ProjectModule,
    VideoModule,
    SceneModule,
    SourceModule,
    JobModule,
    NotificationModule,
    ApiKeyModule,
    CharacterModule,
    FrameModule,
  ],
  controllers: [N8nWebhookController, WorkerWebhookController],
  providers: [JobsGateway],
})
export class AppModule {}
