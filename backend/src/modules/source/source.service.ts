import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiKeyService, ResolvedProvider } from '../api-key/api-key.service';
import { Capability } from '../../common/provider-registry';
import { CreateYoutubeSourceDto } from './dto/create-youtube-source.dto';
import { CreateManualSourceDto } from './dto/create-manual-source.dto';
import { firstValueFrom } from 'rxjs';

type VideoConfig = {
  sceneCount?: number;
  targetDurationSec?: number;
  aspectRatio?: '16:9' | '9:16' | '1:1';
};

function pickVideoConfig(dto: VideoConfig): VideoConfig {
  return {
    sceneCount: dto.sceneCount,
    targetDurationSec: dto.targetDurationSec,
    aspectRatio: dto.aspectRatio,
  };
}

@Injectable()
export class SourceService {
  private readonly logger = new Logger(SourceService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private http: HttpService,
    private apiKeyService: ApiKeyService,
    @InjectQueue('transcript-fetch') private transcriptQueue: Queue,
  ) {}

  async createYoutube(dto: CreateYoutubeSourceDto) {
    if (!dto.url.includes('youtube.com') && !dto.url.includes('youtu.be')) {
      throw new BadRequestException('Invalid YouTube URL');
    }

    const videoConfig = pickVideoConfig(dto);
    const source = await this.prisma.apiSource.create({
      data: {
        projectId: dto.projectId,
        type: 'YOUTUBE',
        inputUrl: dto.url,
        status: 'pending',
        metadata: videoConfig as any,
      },
    });

    const job = await this.transcriptQueue.add(
      'fetch-transcript',
      { sourceId: source.id, url: dto.url, ...videoConfig },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    await this.prisma.apiSource.update({
      where: { id: source.id },
      data: { status: 'fetching', metadata: { ...videoConfig, bullJobId: job.id } as any },
    });

    return { sourceId: source.id, jobId: job.id };
  }

  private async safeResolve(
    capability: Capability,
    provider: string,
    model: string,
  ): Promise<ResolvedProvider | null> {
    try {
      return await this.apiKeyService.resolveProvider(capability, provider, model);
    } catch (e: any) {
      this.logger.warn(`resolveProvider(${capability}, ${provider}, ${model}) skipped: ${e?.message}`);
      return null;
    }
  }

  async createManual(dto: CreateManualSourceDto) {
    const videoConfig = pickVideoConfig(dto);
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
      select: {
        niche: true, language: true, visualStyle: true,
        description: true, scriptBasePrompt: true,
        scriptProvider: true, scriptModel: true,
        imageProvider: true, imageModel: true,
        videoProvider: true, videoModel: true,
      },
    });
    const source = await this.prisma.apiSource.create({
      data: {
        projectId: dto.projectId,
        type: 'MANUAL',
        rawScript: dto.script,
        title: dto.title,
        status: 'fetched',
        metadata: videoConfig as any,
      },
    });

    // Trigger n8n workflow 02 — fire-and-forget. Workflow may run synchronously (Respond Last Node)
    // and take 10-30s, so use a generous timeout. Optimistically set status to 'sent_to_n8n' since
    // BE call is async and we don't want to block the user response.
    const n8nBase = this.config.get('N8N_BASE_URL', 'http://n8n:5678');
    await this.prisma.apiSource.update({ where: { id: source.id }, data: { status: 'sent_to_n8n' } });

    // Resolve provider configs for each capability from project settings.
    // safeResolve returns null for providers not in registry (e.g. pexels, local/slideshow) —
    // workflow falls back to its own defaults for null slots. VIDEO is passthrough only.
    const [scriptProvider, imageProvider] = await Promise.all([
      this.safeResolve('SCRIPT', project?.scriptProvider ?? 'google', project?.scriptModel ?? 'gemini-2.5-flash'),
      this.safeResolve('IMAGE', project?.imageProvider ?? 'google', project?.imageModel ?? 'gemini-2.5-flash-image-preview'),
    ]);
    const providers = {
      script: scriptProvider,
      image: imageProvider,
      video: { provider: project?.videoProvider ?? 'slideshow', model: project?.videoModel ?? 'slideshow' },
    };

    firstValueFrom(
      this.http.post(`${n8nBase}/webhook/generate-scenes`, {
        sourceId: source.id,
        projectId: dto.projectId,
        episode_id: source.id,
        title: dto.title,
        narration_script: dto.script,
        thumbnail_text: dto.title,
        disclaimer_accepted: dto.disclaimerAccepted,
        scene_count: videoConfig.sceneCount,
        target_duration_sec: videoConfig.targetDurationSec,
        aspect_ratio: videoConfig.aspectRatio,
        channel_niche: project?.niche,
        language: project?.language,
        visual_style: project?.visualStyle,
        project_description: project?.description,
        script_base_prompt: project?.scriptBasePrompt,
        providers,
      }, { timeout: 60000 }),
    ).catch((err) => {
      const status = err?.response?.status;
      const msg = status
        ? `n8n trả lỗi HTTP ${status} — kiểm tra workflow "Scene Generation" còn active không`
        : `Không gọi được n8n: ${err?.message || 'unknown'}`;
      this.prisma.apiSource.update({
        where: { id: source.id },
        data: { status: 'failed', errorMsg: msg },
      }).catch(() => {});
    });

    return { ...source, status: 'sent_to_n8n' };
  }

  /**
   * Auto-mark sources stuck in early pipeline stages as failed so the UI doesn't
   * show them as "running forever". n8n doesn't always callback on workflow errors
   * (e.g. when Gemini quota is exhausted), leaving sources orphaned.
   */
  private async markStaleAsFailed(): Promise<void> {
    const staleThresholdSec = 900; // 15 minutes — covers Veo3 paid (~10 min) + assembly time
    const cutoff = new Date(Date.now() - staleThresholdSec * 1000);
    await this.prisma.apiSource.updateMany({
      where: {
        status: { in: ['sent_to_n8n', 'queued', 'fetching'] },
        updatedAt: { lt: cutoff },
      },
      data: {
        status: 'failed',
        errorMsg: `Pipeline timeout sau 15 phút — worker không báo hoàn thành. Thường do API quota hết hoặc worker lỗi. Xem /jobs để chi tiết.`,
      },
    }).catch(() => {});
  }

  async listByProject(projectId: string) {
    await this.markStaleAsFailed();
    return this.prisma.apiSource.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
