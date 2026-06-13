import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiKeyService } from '../api-key/api-key.service';
import { CreateCharacterDto } from './dto/character.dto';

@Injectable()
export class CharacterService {
  private s3: S3Client;
  private bucket: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private apiKeyService: ApiKeyService,
  ) {
    this.s3 = new S3Client({
      endpoint: this.config.get('S3_ENDPOINT', 'http://minio:9000'),
      region: 'us-east-1',
      credentials: {
        accessKeyId: this.config.get('S3_ACCESS_KEY', 'minioadmin'),
        secretAccessKey: this.config.get('S3_SECRET_KEY', 'minioadmin'),
      },
      forcePathStyle: true,
    });
    this.bucket = this.config.get('S3_BUCKET_ASSETS', 'assets');
  }

  private publicUrl(key: string): string {
    const endpoint = (this.config.get('S3_PUBLIC_ENDPOINT') || this.config.get('S3_ENDPOINT', 'http://minio:9000'))
      .replace('minio:9000', 'localhost:9000');
    return `${endpoint}/${this.bucket}/${key}`;
  }

  list(projectId: string) {
    return this.prisma.character.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  create(dto: CreateCharacterDto) {
    return this.prisma.character.create({ data: dto });
  }

  async update(id: string, data: Partial<CreateCharacterDto>) {
    const c = await this.prisma.character.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Character not found');
    const patch: any = { ...data };
    if (data.description !== undefined && data.description !== c.description) {
      patch.imageUrl = null;
      patch.imageKey = null;
    }
    return this.prisma.character.update({ where: { id }, data: patch });
  }

  async remove(id: string) {
    const c = await this.prisma.character.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Character not found');
    return this.prisma.character.delete({ where: { id } });
  }

  /** Returns a formatted DNA string for all characters in a project, for prompt injection. */
  async buildDnaPrompt(projectId: string): Promise<string> {
    const chars = await this.list(projectId);
    if (!chars.length) return '';
    return chars.map(c => `${c.name.toUpperCase()}: ${c.description}`).join('. ');
  }

  async generateImage(id: string) {
    const character = await this.prisma.character.findUnique({ where: { id } });
    if (!character) throw new NotFoundException('Character not found');

    const project = await this.prisma.project.findUnique({
      where: { id: character.projectId },
      select: { imageProvider: true, imageModel: true },
    });

    const resolved = await this.apiKeyService.resolveProvider(
      'IMAGE',
      project?.imageProvider ?? 'google',
      project?.imageModel ?? 'gemini-2.5-flash-image',
    );
    if (!resolved) {
      throw new BadRequestException(
        'Project chưa cấu hình image provider generative (cần google/gemini). Vào AiConfigPanel đổi image provider.',
      );
    }

    const prompt = `Character reference sheet, front view, neutral background, consistent design. ${character.description}. No text, no watermark, no logo.`;
    const url = resolved.authMode === 'query'
      ? `${resolved.url}?${resolved.authName}=${encodeURIComponent(resolved.authValue)}`
      : resolved.url;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(resolved.extraHeaders || {}),
    };
    if (resolved.authMode === 'header') {
      headers[resolved.authName] = resolved.authValue;
    }
    const requestBody = resolved.requestFormat === 'openai_image'
      ? {
          model: resolved.model,
          prompt,
          size: '1024x1024',
        }
      : {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
        };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const snippet = body.slice(0, 300);
      if (res.status === 429) throw new BadRequestException(`Image API quota hết (429). Chi tiết: ${snippet}`);
      throw new InternalServerErrorException(`Image API lỗi HTTP ${res.status}: ${snippet}`);
    }

    const json: any = await res.json();
    const parts: any[] = json?.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p: any) => p?.inlineData?.data);
    const openAiBase64 = json?.data?.[0]?.b64_json;
    if (!imagePart && !openAiBase64) {
      const textParts = parts.filter((p: any) => p?.text).map((p: any) => p.text).join(' ');
      throw new InternalServerErrorException(
        `API không trả ảnh (có thể bị content filter). Response: ${textParts.slice(0, 300)}`,
      );
    }

    const imageBuffer = Buffer.from(openAiBase64 || imagePart.inlineData.data, 'base64');
    const contentType: string = imagePart?.inlineData?.mimeType ?? 'image/png';
    const ext = contentType.split('/')[1] ?? 'png';
    const key = `characters/${id}.${ext}`;

    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: imageBuffer,
      ContentType: contentType,
    }));

    return this.prisma.character.update({
      where: { id },
      data: { imageKey: key, imageUrl: this.publicUrl(key) },
    });
  }
}
