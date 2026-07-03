import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiKeyService } from '../api-key/api-key.service';

@Injectable()
export class VideoService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private http: HttpService,
    private apiKeyService: ApiKeyService,
  ) {}

  private get workerUrl(): string {
    return this.config.get('PYTHON_WORKER_URL', 'http://python_worker:8000');
  }

  private publicUrl(key: string | null | undefined): string | null {
    if (!key) return null;
    const endpoint = (this.config.get('S3_PUBLIC_ENDPOINT') || this.config.get('S3_ENDPOINT', 'http://minio:9000'))
      .replace('minio:9000', 'localhost:9000');
    const bucket = this.config.get('S3_BUCKET_ASSETS', 'assets');
    return `${endpoint}/${bucket}/${key}`;
  }

  async list(projectId?: string, batchId?: string) {
    const videos = await this.prisma.video.findMany({
      where: { ...(projectId ? { projectId } : {}), ...(batchId ? { batchId } : {}) },
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
        imageProvider: true,
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

  /** Phase 4 — sinh lại ảnh cho đúng 1 cảnh, giữ nguyên các cảnh khác. */
  async regenerateSceneImage(videoId: string, sceneIndex: number, prompt?: string) {
    const video = await this.prisma.video.findUnique({ where: { id: videoId }, select: { projectId: true } });
    if (!video) throw new NotFoundException('Video not found');
    const project = await this.prisma.project.findUnique({
      where: { id: video.projectId },
      select: { imageProvider: true, imageModel: true },
    });
    const imageProvider = await this.apiKeyService.resolveProvider('IMAGE', project?.imageProvider, project?.imageModel);
    if (!imageProvider) {
      throw new BadRequestException(`Không có IMAGE key đang hoạt động cho provider "${project?.imageProvider}".`);
    }
    await firstValueFrom(
      this.http.post(`${this.workerUrl}/api/v1/scenes/regenerate-image`, {
        video_id: videoId,
        scene_index: sceneIndex,
        prompt: prompt || undefined,
        image_provider: imageProvider,
      }),
    );
    return { ok: true, status: 'accepted' };
  }

  /** Phase 4 — sinh lại voice cho đúng 1 cảnh (dùng voiceoverText hiện có, sau khi PATCH nếu cần). */
  async regenerateSceneVoice(videoId: string, sceneIndex: number) {
    await firstValueFrom(
      this.http.post(`${this.workerUrl}/api/v1/scenes/regenerate-voice`, {
        video_id: videoId,
        scene_index: sceneIndex,
      }),
    );
    return { ok: true, status: 'accepted' };
  }

  /** Phase 4 — ghép lại master video từ các cảnh hiện có (sau khi sửa/regenerate). */
  async reassemble(videoId: string) {
    const video = await this.prisma.video.findUnique({ where: { id: videoId }, select: { projectId: true } });
    if (!video) throw new NotFoundException('Video not found');
    const project = await this.prisma.project.findUnique({
      where: { id: video.projectId },
      select: { burnSubtitles: true, disableBgm: true },
    });
    await firstValueFrom(
      this.http.post(`${this.workerUrl}/api/v1/videos/reassemble`, {
        video_id: videoId,
        burn_subtitles: project?.burnSubtitles,
        disable_bgm: project?.disableBgm,
      }),
    );
    return { ok: true, status: 'accepted' };
  }
}
