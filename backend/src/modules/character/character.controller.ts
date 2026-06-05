import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CharacterService } from './character.service';
import { CreateCharacterDto } from './dto/character.dto';

@ApiTags('characters')
@Controller('characters')
export class CharacterController {
  constructor(private svc: CharacterService) {}

  @Get() list(@Query('projectId') projectId: string) { return this.svc.list(projectId); }
  @Post() create(@Body() dto: CreateCharacterDto) { return this.svc.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: Partial<CreateCharacterDto>) { return this.svc.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.svc.remove(id); }

  @Post(':id/generate-image')
  generateImage(@Param('id') id: string) { return this.svc.generateImage(id); }
}
