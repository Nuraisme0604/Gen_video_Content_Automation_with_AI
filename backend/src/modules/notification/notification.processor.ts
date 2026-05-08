import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { NotificationService } from './notification.service';

@Processor('notify')
export class NotificationProcessor extends WorkerHost {
  constructor(private notificationService: NotificationService) {
    super();
  }

  async process(job: Job) {
    await this.notificationService.sendTelegram(job.data);
  }
}
