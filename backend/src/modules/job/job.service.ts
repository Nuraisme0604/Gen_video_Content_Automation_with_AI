import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JobService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('render') private renderQueue: Queue,
    @InjectQueue('transcript-fetch') private transcriptQueue: Queue,
    @InjectQueue('notify') private notifyQueue: Queue,
  ) {}

  private get queues(): Record<string, Queue> {
    return {
      'render': this.renderQueue,
      'transcript-fetch': this.transcriptQueue,
      'notify': this.notifyQueue,
    };
  }

  async get(id: string) {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async list(filter: { videoId?: string; projectId?: string; queue?: string; status?: string; limit?: number; offset?: number }) {
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
      if (videoIdsForProject.length === 0) {
        return { items: [], total: 0, limit: filter.limit ?? 50, offset: filter.offset ?? 0 };
      }
    }
    const take = Math.min(Math.max(filter.limit ?? 50, 1), 200);
    const skip = Math.max(filter.offset ?? 0, 0);
    const where = {
      ...(filter.videoId ? { videoId: filter.videoId } : {}),
      ...(videoIdsForProject ? { videoId: { in: videoIdsForProject } } : {}),
      ...(filter.queue ? { queue: filter.queue } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.job.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
      this.prisma.job.count({ where }),
    ]);
    return { items, total, limit: take, offset: skip };
  }

  /** Cancel an in-flight job. Removes from BullMQ + marks DB row as failed.
   *  Note: if the worker is mid-processing, BullMQ.remove() only takes it out of
   *  the queue — it does not kill the running task. The Python worker must finish
   *  whatever it started; this just prevents retries and frees the UI. */
  async cancel(id: string) {
    const row = await this.prisma.job.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Job not found');
    if (row.status === 'completed' || row.status === 'failed') {
      throw new BadRequestException('Job đã kết thúc, không thể huỷ');
    }
    if (row.bullJobId) {
      const queue = this.queues[row.queue];
      if (queue) {
        const bullJob = await queue.getJob(row.bullJobId).catch(() => null);
        await bullJob?.remove().catch(() => {});
      }
    }
    return this.prisma.job.update({
      where: { id },
      data: { status: 'failed', errorMsg: 'cancelled by user', finishedAt: new Date() },
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
