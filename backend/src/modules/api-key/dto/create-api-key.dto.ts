import { IsString, IsEnum, IsOptional, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ApiKeyType } from '@prisma/client';

export class CreateApiKeyDto {
  @ApiProperty() @IsString() provider: string;
  @ApiProperty({ enum: ApiKeyType }) @IsEnum(ApiKeyType) type: ApiKeyType;
  @ApiProperty() @IsString() key: string;        // plain key — stored encrypted, never returned
  @ApiProperty({ required: false }) @IsOptional() @IsString() label?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() projectId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() quotaLimit?: number;
}
