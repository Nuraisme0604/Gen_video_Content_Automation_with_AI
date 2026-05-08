import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';

@Injectable()
export class ProjectService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.project.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async get(id: string) {
    const p = await this.prisma.project.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Project not found');
    return p;
  }

  create(dto: CreateProjectDto) {
    const slug = dto.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    return this.prisma.project.create({ data: { ...dto, slug } });
  }

  async update(id: string, data: Partial<CreateProjectDto>) {
    await this.get(id);
    return this.prisma.project.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.get(id);
    return this.prisma.project.delete({ where: { id } });
  }
}
