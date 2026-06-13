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

const VIDEO_COSTS: Record<string, number> = {
  veo3: 0.59,
  runway: 0.59,
  slideshow: 0.04,
  local: 0.04,
  gemini_session: 0,  // tài khoản Gemini Pro/Ultra — gói phẳng, không tính phí per-video
};

function costPerScene(videoProvider: string, _videoModel?: string): number {
  return VIDEO_COSTS[videoProvider?.toLowerCase()] ?? 0.65;
}

function pickVideoConfig(dto: VideoConfig): VideoConfig {
  return {
    sceneCount: dto.sceneCount,
    targetDurationSec: dto.targetDurationSec,
    aspectRatio: dto.aspectRatio,
  };
}

function normalizeImageModel(provider: string, model: string): string {
  if (provider === 'google' && model === 'gemini-2.5-flash') {
    return 'gemini-2.5-flash-image';
  }
  return model;
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
    // K.5 Budget pre-flight — abort early before creating any DB records
    if (videoConfig.sceneCount) {
      const vProvider = project?.videoProvider ?? 'slideshow';
      const perScene = costPerScene(vProvider, project?.videoModel);
      const estimatedCost = perScene * videoConfig.sceneCount;
      const budgetLimit = parseFloat(this.config.get('BUDGET_LIMIT_PER_VIDEO', '5'));
      if (estimatedCost > budgetLimit) {
        throw new BadRequestException(
          `Chi phí ước tính $${estimatedCost.toFixed(2)} vượt ngưỡng $${budgetLimit.toFixed(2)} — ${videoConfig.sceneCount} scenes × $${perScene.toFixed(2)} (${vProvider}). Giảm số scenes hoặc đổi provider.`,
        );
      }
    }

    const source = await this.prisma.apiSource.create({
      data: {
        projectId: dto.projectId,
        type: 'MANUAL',
        rawScript: dto.script,
        title: dto.title,
        status: 'fetched',
        metadata: { ...videoConfig, voiceScript: dto.voiceScript, qualityMode: dto.qualityMode, characterId: dto.characterId } as any,
      },
    });

    // Trigger n8n workflow 02 — fire-and-forget. Image generation can take several
    // minutes across multiple scenes, so allow the synchronous workflow enough time.
    // BE call is async and we don't want to block the user response.
    const n8nBase = this.config.get('N8N_BASE_URL', 'http://n8n:5678');
    await this.prisma.apiSource.update({ where: { id: source.id }, data: { status: 'sent_to_n8n' } });

    // Resolve a capability's provider config for the n8n payload:
    //  - gemini_session: keyless (cookies live in python_worker), but n8n DOES call
    //    the worker for it → resolve a registry URL via resolveKeyless.
    //  - local / edge-tts: handled entirely inside the worker, no n8n HTTP call → stub.
    //  - everything else: needs an active API key.
    const WORKER_STUB = new Set(['local', 'edge-tts']);
    const resolveFor = async (cap: Capability, provider: string, model: string) => {
      if (provider === 'gemini_session') return this.apiKeyService.resolveKeyless(cap, provider, model);
      if (WORKER_STUB.has(provider)) return { provider, model, key: null };
      return this.safeResolve(cap, provider, model);
    };
    const imageProviderName = project?.imageProvider ?? 'google';
    const imageModel = normalizeImageModel(
      imageProviderName,
      project?.imageModel ?? 'gemini-2.5-flash-image',
    );
    const scriptProvider = await resolveFor(
      'SCRIPT',
      project?.scriptProvider ?? 'google',
      project?.scriptModel ?? 'gemini-2.5-flash',
    );
    let imageProvider: ResolvedProvider | { provider: string; model: string; key: null } | null;
    try {
      imageProvider = await resolveFor('IMAGE', imageProviderName, imageModel);
    } catch (e: any) {
      await this.prisma.apiSource.delete({ where: { id: source.id } }).catch(() => {});
      throw new BadRequestException(`Cấu hình IMAGE không hợp lệ: ${e?.message || 'unknown error'}`);
    }
    if (!imageProvider) {
      await this.prisma.apiSource.delete({ where: { id: source.id } }).catch(() => {});
      throw new BadRequestException(
        `Không có IMAGE key đang hoạt động cho provider "${imageProviderName}".`,
      );
    }
    const providers = {
      script: scriptProvider,
      image: imageProvider,
      video: { provider: project?.videoProvider ?? 'slideshow', model: project?.videoModel ?? 'slideshow' },
    };

    const character = dto.characterId
      ? await this.prisma.character.findUnique({
          where: { id: dto.characterId },
          select: { name: true, description: true, imageUrl: true },
        })
      : null;

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
        voice_script: dto.voiceScript,
        quality_mode: dto.qualityMode,
        character_id: dto.characterId,
        character: character ?? null,
        channel_niche: project?.niche,
        language: project?.language,
        visual_style: project?.visualStyle,
        project_description: project?.description,
        script_base_prompt: project?.scriptBasePrompt,
        providers,
      }, { timeout: 600000 }),
    ).catch(() => {
      this.prisma.apiSource.delete({ where: { id: source.id } }).catch(() => {});
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

  async estimateCost(projectId: string, sceneCount: number, qualityMode?: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { videoProvider: true, videoModel: true },
    });
    const videoProvider = project?.videoProvider ?? 'slideshow';
    const videoModel = project?.videoModel ?? undefined;
    const costPerSceneUsd = costPerScene(videoProvider, videoModel);
    const count = isNaN(sceneCount) || sceneCount < 1 ? 1 : sceneCount;
    return {
      projectId,
      sceneCount: count,
      qualityMode: qualityMode || null,
      videoProvider,
      costPerSceneUsd,
      estimatedCostUsd: parseFloat((count * costPerSceneUsd).toFixed(2)),
    };
  }

  async listByProject(projectId: string) {
    await this.markStaleAsFailed();
    return this.prisma.apiSource.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
