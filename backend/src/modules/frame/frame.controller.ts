import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FrameService } from './frame.service';

@ApiTags('frames')
@Controller('frames')
export class FrameController {
  constructor(private svc: FrameService) {}

  @Get() listByProject(@Query('projectId') projectId: string) { return this.svc.listByProject(projectId); }
  @Get(':id') get(@Param('id') id: string) { return this.svc.get(id); }

  @Post()
  create(@Body() body: { projectId: string; name: string; description?: string }) {
    return this.svc.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { name?: string; description?: string }) {
    return this.svc.update(id, body);
  }

  @Delete(':id') remove(@Param('id') id: string) { return this.svc.remove(id); }

  @Post(':id/images')
  addImage(@Param('id') id: string, @Body() body: { imageKey: string; prompt?: string; sortOrder?: number }) {
    return this.svc.addImage({ frameId: id, ...body });
  }

  @Delete('images/:imageId')
  removeImage(@Param('imageId') imageId: string) { return this.svc.removeImage(imageId); }

  @Post(':id/reorder')
  reorder(@Param('id') id: string, @Body() body: { orderedIds: string[] }) {
    return this.svc.reorderImages(id, body.orderedIds);
  }
}
