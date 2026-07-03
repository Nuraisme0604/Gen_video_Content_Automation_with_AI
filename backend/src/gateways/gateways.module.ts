import { Module } from '@nestjs/common';
import { JobsGateway } from './jobs.gateway';

@Module({
  providers: [JobsGateway],
  exports: [JobsGateway],
})
export class GatewaysModule {}
