import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { JobController } from './job.controller';
import { JobService } from './job.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'render' }),
    BullModule.registerQueue({ name: 'transcript-fetch' }),
    BullModule.registerQueue({ name: 'notify' }),
  ],
  controllers: [JobController],
  providers: [JobService],
  exports: [JobService],
})
export class JobModule {}
