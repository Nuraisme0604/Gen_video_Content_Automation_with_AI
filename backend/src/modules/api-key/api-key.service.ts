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
}
