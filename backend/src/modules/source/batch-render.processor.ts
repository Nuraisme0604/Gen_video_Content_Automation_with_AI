import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { SourceService } from './source.service';
import { PrismaService } from '../../prisma/prisma.service';

type BatchJobData = {
  projectId: string;
  title: string;
  sceneCount?: number;
  qualityMode?: string;
  batchId: string;
};

/**
 * Chạy TUẦN TỰ (concurrency: 1) — mỗi video trong batch phải render xong (hoặc timeout)
 * trước khi video tiếp theo bắt đầu, để không đụng rate-limit Gemini/edge-tts (Phase 6).
 */
@Processor('batch-render', { concurrency: 1 })
export class BatchRenderProcessor extends WorkerHost {
  private readonly logger = new Logger(BatchRenderProcessor.name);

  constructor(
    private sourceService: SourceService,
    private prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<BatchJobData>) {
    const { projectId, title, sceneCount, qualityMode, batchId } = job.data;
    const source = await this.sourceService.createManual({
      projectId,
      title,
      script: '',
      sceneCount,
      qualityMode: qualityMode as any,
      disclaimerAccepted: true,
    } as any);

    const maxWaitMs = 20 * 60 * 1000; // tối đa 20 phút/video trước khi coi là xong (tránh treo cả batch)
    const pollMs = 5000;
    const start = Date.now();
    let tagged = false;

    while (Date.now() - start < maxWaitMs) {
      await new Promise((r) => setTimeout(r, pollMs));
      if (!tagged) {
        const v = await this.prisma.video.findUnique({ where: { id: source.id }, select: { id: true } }).catch(() => null);
        if (v) {
          await this.prisma.video.update({ where: { id: source.id }, data: { batchId } }).catch(() => {});
          tagged = true;
        }
      }
      const s = await this.prisma.apiSource.findUnique({ where: { id: source.id }, select: { status: true } }).catch(() => null);
      if (!s || ['rendered', 'failed', 'uploaded'].includes(s.status)) break;
    }
    this.logger.log(`Batch ${batchId}: "${title}" xong lượt xử lý, chuyển sang video tiếp theo`);
  }
}
