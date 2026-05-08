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

    // Trigger n8n workflow 02 directly
    const n8nBase = this.config.get('N8N_BASE_URL', 'http://n8n:5678');
    try {
      await firstValueFrom(
        this.http.post(`${n8nBase}/webhook/start-pipeline`, {
          sourceId: source.id,
          projectId: dto.projectId,
          title: dto.title,
          script: dto.script,
          disclaimer_accepted: dto.disclaimerAccepted,
        }),
      );
      await this.prisma.apiSource.update({
        where: { id: source.id },
        data: { status: 'sent_to_n8n' },
      });
    } catch {
      await this.prisma.apiSource.update({
        where: { id: source.id },
        data: { status: 'failed', errorMsg: 'n8n trigger failed' },
      });
    }

    return source;
  }

  listByProject(projectId: string) {
    return this.prisma.apiSource.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
