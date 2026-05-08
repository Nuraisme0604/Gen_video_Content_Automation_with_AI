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

  list(filter: { videoId?: string; queue?: string; status?: string }) {
    return this.prisma.job.findMany({
      where: {
        ...(filter.videoId ? { videoId: filter.videoId } : {}),
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
