import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@Injectable()
export class ApiKeyService {
  private readonly algo = 'aes-256-gcm';

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  private encryptionKey(): Buffer {
    const secret = this.config.get('ENCRYPTION_SECRET', 'default-change-me-32-chars-exactly!');
    return Buffer.from(createHash('sha256').update(secret).digest('hex').slice(0, 32));
  }

  private encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(this.algo, this.encryptionKey(), iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('hex'), enc.toString('hex'), tag.toString('hex')].join(':');
  }

  decrypt(encrypted: string): string {
    const [ivHex, encHex, tagHex] = encrypted.split(':');
    const decipher = createDecipheriv(this.algo, this.encryptionKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(encHex, 'hex')).toString('utf8') + decipher.final('utf8');
  }

  list(projectId?: string) {
    return this.prisma.apiKey.findMany({
      where: projectId ? { projectId } : {},
      select: {
        id: true, provider: true, type: true, label: true,
        keyMasked: true, quotaLimit: true, quotaUsed: true, isActive: true, createdAt: true,
        // keyEncrypted is intentionally excluded from list — never sent to FE
      },
      orderBy: [{ type: 'asc' }, { provider: 'asc' }],
    });
  }

  create(dto: CreateApiKeyDto) {
    const keyHash = createHash('sha256').update(dto.key).digest('hex');
    const keyMasked = dto.key.length > 4 ? `...${dto.key.slice(-4)}` : '****';
    return this.prisma.apiKey.create({
      data: {
        provider: dto.provider,
        type: dto.type,
        label: dto.label,
        projectId: dto.projectId,
        quotaLimit: dto.quotaLimit,
        keyHash,
        keyMasked,
        keyEncrypted: this.encrypt(dto.key),
      },
      select: {
        id: true, provider: true, type: true, label: true,
        keyMasked: true, quotaLimit: true, quotaUsed: true, isActive: true, createdAt: true,
      },
    });
  }

  async toggleActive(id: string) {
    const key = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!key) throw new NotFoundException('API key not found');
    return this.prisma.apiKey.update({
      where: { id },
      data: { isActive: !key.isActive },
      select: { id: true, isActive: true },
    });
  }

  async remove(id: string) {
    const key = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!key) throw new NotFoundException('API key not found');
    return this.prisma.apiKey.delete({ where: { id } });
  }

  async resetQuota(id: string) {
    return this.prisma.apiKey.update({ where: { id }, data: { quotaUsed: 0 } });
  }

  /**
   * Pick the active key with lowest quotaUsed for a given capability.
   * Used by internal services (n8n, worker) to get a working key for outbound API calls.
   * Returns the DECRYPTED key — only call from trusted internal code paths.
   */
  async pickActive(capability: string, provider?: string): Promise<{ id: string; provider: string; key: string } | null> {
    const where: any = { type: capability, isActive: true };
    if (provider) where.provider = provider;
    const key = await this.prisma.apiKey.findFirst({
      where,
      orderBy: [{ quotaUsed: 'asc' }, { createdAt: 'asc' }],
    });
    if (!key) return null;
    // Bump usage counter (best-effort, non-blocking)
    this.prisma.apiKey.update({
      where: { id: key.id },
      data: { quotaUsed: { increment: 1 } },
    }).catch(() => {});
    return {
      id: key.id,
      provider: key.provider,
      key: this.decrypt(key.keyEncrypted),
    };
  }

  /** Test if an API key is valid by hitting the provider's lightest endpoint. */
  async testKey(key: string, provider: string): Promise<{ ok: boolean; latencyMs?: number; error?: string; detail?: string }> {
    const t0 = Date.now();
    try {
      let url = '', headers: Record<string, string> = {};
      switch (provider.toLowerCase()) {
        case 'google':
          url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
          break;
        case 'openai':
          url = 'https://api.openai.com/v1/models';
          headers = { Authorization: `Bearer ${key}` };
          break;
        case 'anthropic':
          url = 'https://api.anthropic.com/v1/models';
          headers = { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
          break;
        case 'elevenlabs':
          url = 'https://api.elevenlabs.io/v1/user';
          headers = { 'xi-api-key': key };
          break;
        case 'runway':
          url = 'https://api.dev.runwayml.com/v1/organization';
          headers = { Authorization: `Bearer ${key}`, 'X-Runway-Version': '2024-11-06' };
          break;
        case 'replicate':
          url = 'https://api.replicate.com/v1/account';
          headers = { Authorization: `Token ${key}` };
          break;
        case 'pexels':
          url = 'https://api.pexels.com/v1/curated?per_page=1';
          headers = { Authorization: key };
          break;
        default:
          return { ok: false, error: `Provider "${provider}" chưa hỗ trợ test connection` };
      }

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, { method: 'GET', headers, signal: ctrl.signal });
      clearTimeout(timer);
      const latencyMs = Date.now() - t0;

      if (res.ok) return { ok: true, latencyMs };

      const body = await res.text().catch(() => '');
      const trimmed = body.slice(0, 200);
      if (res.status === 401 || res.status === 403) return { ok: false, error: 'Key không hợp lệ hoặc bị từ chối', detail: trimmed };
      if (res.status === 429) return { ok: false, error: 'Quota tạm thời hết — key vẫn hợp lệ', detail: trimmed };
      return { ok: false, error: `HTTP ${res.status}`, detail: trimmed };
    } catch (e: any) {
      return { ok: false, error: e?.name === 'AbortError' ? 'Timeout (>8s)' : e?.message || 'Lỗi kết nối' };
    }
  }
}
