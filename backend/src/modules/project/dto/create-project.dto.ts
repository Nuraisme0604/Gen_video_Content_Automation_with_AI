import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class CreateProjectDto {
  @IsString() name: string;
  @IsOptional() @IsString() language?: string;
  @IsOptional() @IsString() niche?: string;
  @IsOptional() @IsString() visualStyle?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() voiceProvider?: string;
  @IsOptional() @IsString() voiceId?: string;
  @IsOptional() @IsNumber() voiceSpeed?: number;
  @IsOptional() @IsString() voiceEmotion?: string;
  @IsOptional() @IsBoolean() burnSubtitles?: boolean;
  @IsOptional() @IsString() scriptProvider?: string;
  @IsOptional() @IsString() scriptModel?: string;
  @IsOptional() @IsString() refineProvider?: string;
  @IsOptional() @IsString() refineModel?: string;
  @IsOptional() @IsString() imageProvider?: string;
  @IsOptional() @IsString() imageModel?: string;
  @IsOptional() @IsString() videoProvider?: string;
  @IsOptional() @IsString() videoModel?: string;
  @IsOptional() @IsString() scriptBasePrompt?: string;
}
