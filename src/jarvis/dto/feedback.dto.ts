import { IsString, IsInt, IsOptional, Min, Max, IsUUID } from 'class-validator';

export class FeedbackDto {
  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsString()
  question: string;

  @IsString()
  answer: string;

  @IsInt()
  @Min(1)
  @Max(5)
  score: number;

  @IsOptional()
  @IsString()
  comment?: string;
}
