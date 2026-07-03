import { IsString, IsArray, IsOptional, IsInt, IsIn, Min, Max, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class CreateBatchDto {
  @IsString() projectId: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsString({ each: true })
  titles: string[];

  @IsOptional() @IsInt() @Min(3) @Max(20) sceneCount?: number;

  @IsOptional() @IsIn(['draft', 'standard', 'premium']) qualityMode?: 'draft' | 'standard' | 'premium';
}
