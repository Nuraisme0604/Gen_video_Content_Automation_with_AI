import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SourceService } from './source.service';
import { CreateYoutubeSourceDto } from './dto/create-youtube-source.dto';
import { CreateManualSourceDto } from './dto/create-manual-source.dto';

@ApiTags('sources')
@Controller('sources')
export class SourceController {
  constructor(private svc: SourceService) {}

  @Post('youtube')
  createYoutube(@Body() dto: CreateYoutubeSourceDto) { return this.svc.createYoutube(dto); }

  @Post('manual')
  createManual(@Body() dto: CreateManualSourceDto) { return this.svc.createManual(dto); }

  @Get('estimate-cost')
  async estimateCost(
    @Query('projectId') projectId: string,
    @Query('sceneCount') sceneCount: string,
    @Query('qualityMode') qualityMode?: string,
  ) { return this.svc.estimateCost(projectId, parseInt(sceneCount, 10), qualityMode); }

  @Get('project/:projectId')
  listByProject(@Param('projectId') projectId: string) { return this.svc.listByProject(projectId); }
}
