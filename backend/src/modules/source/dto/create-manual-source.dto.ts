import { IsString, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateManualSourceDto {
  @ApiProperty() @IsString() projectId: string;
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() script: string;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() disclaimerAccepted?: boolean;
}
