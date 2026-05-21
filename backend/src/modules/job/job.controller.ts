import { Controller, Get, Delete, Param, Query } from '@nestjs/common';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { JobService } from './job.service';

@ApiTags('jobs')
@Controller('jobs')
export class JobController {
  constructor(private svc: JobService) {}

  @Get()
  @ApiQuery({ name: 'videoId',   required: false })
  @ApiQuery({ name: 'projectId', required: false })
  @ApiQuery({ name: 'queue',     required: false })
  @ApiQuery({ name: 'status',    required: false })
  @ApiQuery({ name: 'limit',     required: false })
  @ApiQuery({ name: 'offset',    required: false })
  list(
    @Query('videoId')   videoId?:   string,
    @Query('projectId') projectId?: string,
    @Query('queue')     queue?:     string,
    @Query('status')    status?:    string,
    @Query('limit')     limit?:     string,
    @Query('offset')    offset?:    string,
  ) {
    return this.svc.list({
      videoId,
      projectId,
      queue,
      status,
      limit:  limit  ? parseInt(limit, 10)  : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id')    get(@Param('id') id: string)    { return this.svc.get(id); }
  @Delete(':id') cancel(@Param('id') id: string) { return this.svc.cancel(id); }
}
