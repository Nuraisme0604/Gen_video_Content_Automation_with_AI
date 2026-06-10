import { Controller, Post, Body, Headers, UnauthorizedException, Logger } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { JobsGateway } from '../gateways/jobs.gateway';
import { CharacterService } from '../modules/character/character.service';

@ApiTags('webhooks')
@Controller('webhooks/n8n')
export class N8nWebhookController {
  private readonly logger = new Logger(N8nWebhookController.name);

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private gateway: JobsGateway,
    private characters: CharacterService,
    @InjectQueue('render') private renderQueue: Queue,
  ) {}

  private verifyHmac(body: string, signature: string) {
    const secret = this.config.get('WEBHOOK_HMAC_SECRET', 'change-me-in-prod');
    const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
    try {
      const a = Buffer.from(signature);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        throw new UnauthorizedException('Invalid HMAC signature');
      }
    } catch {
      throw new UnauthorizedException('Invalid HMAC signature');
    }
  }

  /** n8n calls this when the script pipeline is complete and ready to render. */
  @Post('render-request')
  async renderRequest(
    @Body() body: any,
    @Headers('x-signature') sig: string,
  ) {
    // Skip HMAC in dev if secret not changed
    const secret = this.config.get('WEBHOOK_HMAC_SECRET');
    if (secret && secret !== 'change-me-in-prod') {
      this.verifyHmac(JSON.stringify(body), sig);
    }

    const { episode_id, project_id, manifest } = body;

    // Honor the per-project video provider the user picked in the UI so it actually
    // drives the worker (worker falls back to env VIDEO_PROVIDER if this is absent).
    if (manifest && project_id) {
      const proj = await this.prisma.project.findUnique({
        where: { id: project_id },
        select: { videoProvider: true },
      });
      if (proj?.videoProvider) manifest.video_provider = proj.videoProvider;
    }

    // Create or update video record
    const video = await this.prisma.video.upsert({
      where: { id: episode_id },
      create: { id: episode_id, projectId: project_id, status: 'rendering', title: manifest?.title },
      update: { status: 'rendering' },
    });

    // Build character DNA string and inject into scene prompts
    const dna = project_id ? await this.characters.buildDnaPrompt(project_id) : '';

    // Create scenes from manifest
    if (manifest?.scenes?.length) {
      for (const s of manifest.scenes) {
        const injectDna = (prompt?: string) =>
          dna && prompt ? `${prompt}. Characters: ${dna}` : prompt;

        await this.prisma.scene.upsert({
          where: { id: `${episode_id}_${s.index}` },
          create: {
            id: `${episode_id}_${s.index}`,
            videoId: video.id,
            sceneIndex: s.index,
            voiceoverText: s.voiceover,
            videoPrompt: injectDna(s.video_prompt),
            imagePrompt: injectDna(s.image_prompt),
            imageKey: s.image_url,
            status: 'pending',
          },
          update: { status: 'pending' },
        });
      }
    }

    // Enqueue render job
    const job = await this.renderQueue.add('render-video', {
      videoId: video.id,
      episodeId: episode_id,
      projectId: project_id,
      manifest,
    }, {
      attempts: 2,
      backoff: { type: 'fixed', delay: 10000 },
    });

    await this.prisma.job.create({
      data: {
        bullJobId: String(job.id),
        queue: 'render',
        videoId: video.id,
        projectId: project_id,
        status: 'queued',
        payload: body as any,
      },
    });

    this.gateway.emitJobQueued(video.id, { jobId: job.id, videoId: video.id, queue: 'render' });
    this.logger.log(`Render job ${job.id} queued for video ${video.id}`);

    return { ok: true, jobId: job.id, videoId: video.id };
  }

  /** n8n calls this when QA fails or script pipeline errors. */
  @Post('pipeline-error')
  async pipelineError(@Body() body: { episode_id: string; error: string }) {
    if (body.episode_id) {
      await this.prisma.video.updateMany({
        where: { id: body.episode_id },
        data: { status: 'failed', errorMsg: body.error },
      });
    }
    this.logger.error(`Pipeline error for ${body.episode_id}: ${body.error}`);
    return { ok: true };
  }
}
