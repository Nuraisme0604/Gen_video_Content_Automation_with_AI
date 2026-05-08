import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class VideoService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  list(projectId?: string) {
    return this.prisma.video.findMany({
      where: projectId ? { projectId } : {},
      include: { _count: { select: { scenes: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string) {
    const v = await this.prisma.video.findUnique({
      where: { id },
      include: { scenes: { orderBy: { sceneIndex: 'asc' } } },
    });
    if (!v) throw new NotFoundException('Video not found');
    return v;
  }

  async getPreviewUrl(id: string) {
    const v = await this.get(id);
    if (!v.masterVideoKey) return { url: null };
    const endpoint = this.config.get('S3_ENDPOINT', 'http://minio:9000');
    const bucket = this.config.get('S3_BUCKET_ASSETS', 'assets');
    // For Phase 2 return direct URL. Phase 3 will use presigned via MinIO SDK.
    return { url: `${endpoint}/${bucket}/${v.masterVideoKey}` };
  }

  update(id: string, data: Record<string, any>) {
    return this.prisma.video.update({ where: { id }, data });
  }

  remove(id: string) {
    return this.prisma.video.delete({ where: { id } });
  }
}
