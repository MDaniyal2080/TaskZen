import { IsEnum, IsString, IsOptional, IsArray, IsUUID, IsNumber, IsBoolean, IsDateString, IsObject, IsIn } from 'class-validator';
import { ContentType, ReportReason, ReportStatus, ReportPriority, ViolationType, ViolationSeverity, ModActionType } from '@prisma/client';

export class CreateReportDto {
  @IsEnum(ContentType)
  contentType: ContentType;

  @IsString()
  contentId: string;

  @IsEnum(ReportReason)
  reason: ReportReason;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ReportPriority)
  priority?: ReportPriority;
}

export class UpdateReportDto {
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @IsOptional()
  @IsEnum(ReportPriority)
  priority?: ReportPriority;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateViolationDto {
  @IsString()
  userId: string;

  @IsEnum(ViolationType)
  type: ViolationType;

  @IsEnum(ViolationSeverity)
  severity: ViolationSeverity;

  @IsString()
  description: string;

  @IsOptional()
  @IsObject()
  evidence?: any;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsBoolean()
  autoAction?: boolean;
}

export class CreateModerationActionDto {
  @IsString()
  targetUserId: string;

  @IsEnum(ModActionType)
  action: ModActionType;

  @IsString()
  reason: string;

  @IsOptional()
  @IsNumber()
  duration?: number; // in hours

  @IsOptional()
  @IsObject()
  metadata?: any;

  @IsOptional()
  @IsString()
  reportId?: string;

  @IsOptional()
  @IsString()
  violationId?: string;
}

export class BulkActionDto {
  @IsArray()
  @IsString({ each: true })
  reportIds: string[];

  @IsIn(['resolve', 'dismiss', 'escalate', 'delete_content', 'ban_user'])
  action: 'resolve' | 'dismiss' | 'escalate' | 'delete_content' | 'ban_user';

  @IsOptional()
  @IsString()
  reason?: string;
}

export class GetReportsQueryDto {
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @IsOptional()
  @IsEnum(ContentType)
  contentType?: ContentType;

  @IsOptional()
  @IsEnum(ReportPriority)
  priority?: ReportPriority;

  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

export class GetViolationsQueryDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsEnum(ViolationType)
  type?: ViolationType;

  @IsOptional()
  @IsEnum(ViolationSeverity)
  severity?: ViolationSeverity;

  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  limit?: number;
}

export class GetModerationActionsQueryDto {
  @IsOptional()
  @IsString()
  targetUserId?: string;

  @IsOptional()
  @IsString()
  moderatorId?: string;

  @IsOptional()
  @IsEnum(ModActionType)
  action?: ModActionType;

  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  limit?: number;
}
