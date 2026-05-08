import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FrameService {
  constructor(private prisma: PrismaService) {}

  listByProject(projectId: string) {
    return this.prisma.frame.findMany({
      where: { projectId },
      include: { images: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string) {
    const f = await this.prisma.frame.findUnique({ where: { id }, include: { images: { orderBy: { sortOrder: 'asc' } } } });
    if (!f) throw new NotFoundException('Frame not found');
    return f;
  }

  create(data: { projectId: string; name: string; description?: string }) {
    return this.prisma.frame.create({ data });
  }

  async update(id: string, data: { name?: string; description?: string }) {
    await this.get(id);
    return this.prisma.frame.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.get(id);
    return this.prisma.frame.delete({ where: { id } });
  }

  addImage(data: { frameId: string; imageKey: string; prompt?: string; sortOrder?: number }) {
    return this.prisma.frameImage.create({ data });
  }

  async removeImage(imageId: string) {
    return this.prisma.frameImage.delete({ where: { id: imageId } });
  }

  async reorderImages(frameId: string, orderedIds: string[]) {
    await Promise.all(
      orderedIds.map((id, idx) =>
        this.prisma.frameImage.update({ where: { id }, data: { sortOrder: idx } }),
      ),
    );
    return this.get(frameId);
  }
}
