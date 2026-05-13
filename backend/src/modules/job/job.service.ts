import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JobService {
  constructor(private prisma: PrismaService) {}

  async get(id: string) {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async list(filter: { videoId?: string; projectId?: string; queue?: string; status?: string }) {
    // Job has no direct projectId column — derive by looking up all video ids for the project.
    let videoIdsForProject: string[] | undefined;
    if (filter.projectId) {
      const videos = await this.prisma.video.findMany({
        where: { projectId: filter.projectId },
        select: { id: true },
      });
      videoIdsForProject = videos.map(v => v.id);
      // If the project has no videos yet, return empty quickly instead of running an
      // unconstrained query (which would otherwise leak jobs from other projects).
      if (videoIdsForProject.length === 0) return [];
    }
    return this.prisma.job.findMany({
      where: {
        ...(filter.videoId ? { videoId: filter.videoId } : {}),
        ...(videoIdsForProject ? { videoId: { in: videoIdsForProject } } : {}),
        ...(filter.queue ? { queue: filter.queue } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  create(data: {
    queue: string;
    videoId?: string;
    projectId?: string;
    payload: object;
    bullJobId?: string;
  }) {
    return this.prisma.job.create({ data: { ...data, status: 'queued' } });
  }

  updateStatus(
    bullJobId: string,
    update: { status: string; progress?: number; stage?: string; result?: object; errorMsg?: string },
  ) {
    return this.prisma.job.updateMany({
      where: { bullJobId },
      data: {
        ...update,
        ...(update.status === 'completed' || update.status === 'failed'
          ? { finishedAt: new Date() }
          : {}),
      },
    });
  }
}
