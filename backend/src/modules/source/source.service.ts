import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateYoutubeSourceDto } from './dto/create-youtube-source.dto';
import { CreateManualSourceDto } from './dto/create-manual-source.dto';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class SourceService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private http: HttpService,
    @InjectQueue('transcript-fetch') private transcriptQueue: Queue,
  ) {}

  async createYoutube(dto: CreateYoutubeSourceDto) {
    if (!dto.url.includes('youtube.com') && !dto.url.includes('youtu.be')) {
      throw new BadRequestException('Invalid YouTube URL');
    }

    const source = await this.prisma.apiSource.create({
      data: {
        projectId: dto.projectId,
        type: 'YOUTUBE',
        inputUrl: dto.url,
        status: 'pending',
      },
    });

    const job = await this.transcriptQueue.add(
      'fetch-transcript',
      { sourceId: source.id, url: dto.url },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    await this.prisma.apiSource.update({
      where: { id: source.id },
      data: { status: 'fetching', metadata: { bullJobId: job.id } as any },
    });

    return { sourceId: source.id, jobId: job.id };
  }

  async createManual(dto: CreateManualSourceDto) {
    const source = await this.prisma.apiSource.create({
      data: {
        projectId: dto.projectId,
        type: 'MANUAL',
        rawScript: dto.script,
        title: dto.title,
        status: 'fetched',
      },
    });

    // Trigger n8n workflow 02 — fire-and-forget. Workflow may run synchronously (Respond Last Node)
    // and take 10-30s, so use a generous timeout. Optimistically set status to 'sent_to_n8n' since
    // BE call is async and we don't want to block the user response.
    const n8nBase = this.config.get('N8N_BASE_URL', 'http://n8n:5678');
    await this.prisma.apiSource.update({ where: { id: source.id }, data: { status: 'sent_to_n8n' } });

    firstValueFrom(
      this.http.post(`${n8nBase}/webhook/generate-scenes`, {
        sourceId: source.id,
        projectId: dto.projectId,
        episode_id: source.id,
        title: dto.title,
        narration_script: dto.script,
        thumbnail_text: dto.title,
        disclaimer_accepted: dto.disclaimerAccepted,
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
