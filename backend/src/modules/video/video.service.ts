import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class VideoService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  private publicUrl(key: string | null | undefined): string | null {
    if (!key) return null;
    const endpoint = (this.config.get('S3_PUBLIC_ENDPOINT') || this.config.get('S3_ENDPOINT', 'http://minio:9000'))
      .replace('minio:9000', 'localhost:9000');
    const bucket = this.config.get('S3_BUCKET_ASSETS', 'assets');
    return `${endpoint}/${bucket}/${key}`;
  }

  async list(projectId?: string) {
    const videos = await this.prisma.video.findMany({
      where: projectId ? { projectId } : {},
      include: { _count: { select: { scenes: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return videos.map((v) => ({
      ...v,
      thumbnailUrl: this.publicUrl(v.thumbnailKey),
    }));
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
    return { url: this.publicUrl(v.masterVideoKey) };
  }

  async getClips(id: string) {
    const scenes = await this.prisma.scene.findMany({
      where: { videoId: id },
      orderBy: { sceneIndex: 'asc' },
      select: {
        id: true,
        sceneIndex: true,
        videoKey: true,
        imageKey: true,
        durationSec: true,
        status: true,
        voiceoverText: true,
        errorMessage: true,
      },
    });
    return scenes.map((s) => ({
      ...s,
      clipUrl: this.publicUrl(s.videoKey),
      imageUrl: this.publicUrl(s.imageKey),
    }));
  }

  update(id: string, data: Record<string, any>) {
    return this.prisma.video.update({ where: { id }, data });
  }

  remove(id: string) {
    return this.prisma.video.delete({ where: { id } });
  }
}
