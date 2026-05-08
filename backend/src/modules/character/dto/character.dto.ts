import { IsString, IsOptional } from 'class-validator';

export class CreateCharacterDto {
  @IsString() projectId: string;
  @IsString() name: string;
  @IsString() description: string;
  @IsOptional() @IsString() imageKey?: string;
}
