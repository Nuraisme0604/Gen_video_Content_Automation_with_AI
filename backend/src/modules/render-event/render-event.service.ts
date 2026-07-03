import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RenderEventService {
  constructor(private prisma: PrismaService) {}

  create(data: { videoId: string; level: 'info' | 'warn' | 'error'; stage: string; message: string }) {
    return this.prisma.renderEvent.create({ data });
  }

  list(videoId: string) {
    return this.prisma.renderEvent.findMany({
      where: { videoId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
