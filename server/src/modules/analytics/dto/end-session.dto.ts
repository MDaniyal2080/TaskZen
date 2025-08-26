import { IsString, IsOptional, IsObject } from "class-validator";

export class EndSessionDto {
  @IsString()
  sessionId!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
