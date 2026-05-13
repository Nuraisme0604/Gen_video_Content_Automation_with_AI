import { IsString, IsBoolean, IsOptional, IsInt, IsIn, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateManualSourceDto {
  @ApiProperty() @IsString() projectId: string;
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() script: string;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() disclaimerAccepted?: boolean;

  @ApiProperty({ required: false, description: 'Required from UI: số scenes (3..20)' })
  @IsOptional() @IsInt() @Min(3) @Max(20) sceneCount?: number;

  @ApiProperty({ required: false, description: 'Required from UI: tổng thời lượng video (giây)' })
  @IsOptional() @IsInt() @Min(15) @Max(1800) targetDurationSec?: number;

  @ApiProperty({ required: false, enum: ['16:9', '9:16', '1:1'] })
  @IsOptional() @IsIn(['16:9', '9:16', '1:1']) aspectRatio?: '16:9' | '9:16' | '1:1';
}
