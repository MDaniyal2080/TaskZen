import { IsIn, IsOptional, IsString, IsObject } from "class-validator";
import { AnalyticsEventTypes, FeatureKeys } from "../types";

export class CreateAnalyticsEventDto {
  @IsIn(Array.from(AnalyticsEventTypes))
  type!: (typeof AnalyticsEventTypes)[number];

  @IsOptional()
  @IsIn(Array.from(FeatureKeys))
  feature?: (typeof FeatureKeys)[number];

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  referrer?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  device?: string;

  @IsOptional()
  @IsString()
  browser?: string;

  @IsOptional()
  @IsString()
  os?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  boardId?: string;

  @IsOptional()
  @IsString()
  cardId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
