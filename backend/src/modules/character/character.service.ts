import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCharacterDto } from './dto/character.dto';

@Injectable()
export class CharacterService {
  constructor(private prisma: PrismaService) {}

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
    return this.prisma.character.update({ where: { id }, data });
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
}
