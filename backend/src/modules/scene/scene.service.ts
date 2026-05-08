import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SceneService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('render') private renderQueue: Queue,
  ) {}

  listByVideo(videoId: string) {
    return this.prisma.scene.findMany({
      where: { videoId },
      include: { subtitles: true },
      orderBy: { sceneIndex: 'asc' },
    });
  }

  async get(id: string) {
    const s = await this.prisma.scene.findUnique({ where: { id }, include: { subtitles: true } });
    if (!s) throw new NotFoundException('Scene not found');
    return s;
  }

  async regenerate(id: string) {
    const scene = await this.get(id);
    await this.prisma.scene.update({ where: { id }, data: { status: 'queued', errorMessage: null } });
    const job = await this.renderQueue.add('regenerate-scene', { sceneId: id, videoId: scene.videoId }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
    return { jobId: job.id, sceneId: id };
  }

  update(id: string, data: Record<string, any>) {
    return this.prisma.scene.update({ where: { id }, data });
  }
}
