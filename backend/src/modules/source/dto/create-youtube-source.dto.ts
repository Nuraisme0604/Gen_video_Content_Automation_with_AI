import { IsString, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateYoutubeSourceDto {
  @ApiProperty() @IsString() projectId: string;
  @ApiProperty() @IsUrl() url: string;
}
