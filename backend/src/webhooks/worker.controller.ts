import { Controller, Post, Body, Logger } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { JobsGateway } from '../gateways/jobs.gateway';
import { NotificationService } from '../modules/notification/notification.service';
import { JobService } from '../modules/job/job.service';
import { firstValueFrom } from 'rxjs';

@ApiTags('webhooks')
@Controller('webhooks/worker')
export class WorkerWebhookController {
  private readonly logger = new Logger(WorkerWebhookController.name);

  constructor(
    private prisma: PrismaService,
    private gateway: JobsGateway,
    private notification: NotificationService,
    private jobService: JobService,
    private config: ConfigService,
    private http: HttpService,
  ) {}

  /** Python worker pushes scene progress here. */
  @Post('scene-progress')
  async sceneProgress(@Body() body: {
    videoId: string;
    bullJobId?: string;
    sceneIndex: number;
    progress: number;
    stage?: string;
    previewUrl?: string;
  }) {
    await this.prisma.scene.updateMany({
      where: { videoId: body.videoId, sceneIndex: body.sceneIndex },
      data: { status: body.progress >= 100 ? 'done' : 'rendering' },
    });

    if (body.bullJobId) {
      await this.jobService.updateStatus(body.bullJobId, {
        status: 'active',
        progress: body.progress,
        stage: body.stage,
      });
    }

    this.gateway.emitJobProgress(body.videoId, {
      jobId: body.bullJobId || '',
      progress: body.progress,
      stage: body.stage,
    });

    if (body.previewUrl) {
      this.gateway.emitSceneRendered(body.videoId, {
        sceneIndex: body.sceneIndex,
        previewUrl: body.previewUrl,
      });
    }

    return { ok: true };
  }

  /** Python worker calls this when the full render is done. */
  @Post('render-complete')
  async renderComplete(@Body() body: {
    videoId: string;
    bullJobId?: string;
    masterVideoKey?: string;
    thumbnailKey?: string;
    durationSec?: number;
    totalCostUsd?: number;
    success: boolean;
    error?: string;
  }) {
    await this.prisma.video.update({
      where: { id: body.videoId },
      data: {
        status: body.success ? 'done' : 'failed',
        masterVideoKey: body.masterVideoKey,
        thumbnailKey: body.thumbnailKey,
        durationSec: body.durationSec,
        totalCostUsd: body.totalCostUsd,
        errorMsg: body.error,
      },
    });

    if (body.bullJobId) {
      await this.jobService.updateStatus(body.bullJobId, {
        status: body.success ? 'completed' : 'failed',
        progress: 100,
        errorMsg: body.error,
      });
    }

    const video = await this.prisma.video.findUnique({ where: { id: body.videoId }, include: { project: true } });

    if (body.success) {
      this.gateway.emitJobComplete(body.videoId, { masterVideoKey: body.masterVideoKey });

      // Notify Telegram
      const title = video?.title || body.videoId;
      await this.notification.enqueue({
        event: 'video_complete',
        videoId: body.videoId,
        projectId: video?.projectId,
        message: `✅ <b>${title}</b> hoàn thành!\n⏱ ${Math.round((body.durationSec || 0) / 60)}:${String(Math.round((body.durationSec || 0) % 60)).padStart(2, '0')} · 💰 $${(body.totalCostUsd || 0).toFixed(2)}`,
      });
    } else {
      this.gateway.emitJobFailed(body.videoId, { error: body.error || 'Unknown error' });
    }

    // Call back to n8n render-complete webhook to preserve existing n8n post-render flow (YouTube upload etc.)
    const n8nBase = this.config.get('N8N_BASE_URL', 'http://n8n:5678');
    try {
      await firstValueFrom(
        this.http.post(`${n8nBase}/webhook/render-complete`, {
          video_id: body.videoId,
          success: body.success,
          master_video_key: body.masterVideoKey,
        }),
      );
    } catch (e) {
      this.logger.warn(`n8n render-complete callback failed: ${(e as any).message}`);
    }

    return { ok: true };
  }

  /** Internal endpoint for Python worker to trigger notifications (replaces distributor.py Telegram). */
  @Post('notify')
  async notify(@Body() body: { videoId?: string; event: string; message: string; projectId?: string }) {
    await this.notification.enqueue(body);
    return { ok: true };
  }
}
